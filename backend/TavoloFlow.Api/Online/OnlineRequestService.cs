using System.Linq.Expressions;
using System.Security.Cryptography;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Data.Configurations;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Ordering;

namespace TavoloFlow.Api.Online;

// Online submissions. A submission only writes an online_requests row; staff acceptance creates the
// session, order and order items later.
public sealed class OnlineRequestService(ApplicationDbContext db, TimeProvider clock)
{
    public static readonly TimeSpan WaitingTime = TimeSpan.FromMinutes(10);

    // Customer contact data (name, phone, address, notes) is kept this long after submission.
    public static readonly TimeSpan ContactRetention = TimeSpan.FromDays(30);

    // Lock order: restaurant SHARE, then the day's counter row. Menu writers take restaurant UPDATE, so
    // prices and snapshots stay stable; the counter row serializes one restaurant's submissions per day,
    // so the duplicate check and the waiting cap below run one submission at a time.
    public async Task<OnlineSubmission> SubmitAsync(
        string slug,
        OnlineRequestInput input,
        CancellationToken ct
    )
    {
        var form = Validate(slug, input);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var restaurantId =
            await db
                .Restaurants.Where(r => r.Slug == slug)
                .Select(r => (Guid?)r.Id)
                .SingleOrDefaultAsync(ct)
            ?? throw OnlineErrors.LinkNotFound();
        var restaurant = await RowLocks.RestaurantAsync(db, restaurantId, RowLock.Share, ct);
        // The platform may have changed the link meanwhile.
        if (restaurant?.Slug != slug)
            throw OnlineErrors.LinkNotFound();
        var now = clock.GetUtcNow();
        var zone = TimeZoneInfo.FindSystemTimeZoneById(restaurant.TimeZone);
        var businessDate = DateOnly.FromDateTime(OnlineSchedule.Local(zone, now));
        var number = (
            await db
                .Database.SqlQuery<int>(
                    $"""
                    INSERT INTO online_counters (restaurant_id, business_date, last_number)
                    VALUES ({restaurantId}, {businessDate}, 1)
                    ON CONFLICT (restaurant_id, business_date)
                    DO UPDATE SET last_number = online_counters.last_number + 1
                    RETURNING last_number AS "Value"
                    """
                )
                .ToListAsync(ct)
        ).Single();

        // A repeat returns the stored result before any later gate, and rolls back so it uses no number.
        var original = await StoredAsync(
            restaurantId,
            r => r.ClientRequestId == form.ClientRequestId,
            ct
        );
        if (original is not null)
        {
            await transaction.RollbackAsync(ct);
            return new(original, false);
        }

        var (_, availability) = await OnlineAvailability.ReadAsync(db, restaurant, now, ct);
        if (!availability.IsOpen)
            throw OnlineErrors.NotOpen(availability);
        // Delivery has no switch yet, so no restaurant offers it.
        if (form.Fulfillment == OnlineFulfillment.Delivery)
            throw OnlineErrors.DeliveryNotOffered();
        var lines = await OrderLines.SnapshotAsync(db, restaurantId, form.Lines, ct);
        var submittedAt = now.UtcDateTime;
        var request = new OnlineRequest
        {
            Id = Guid.CreateVersion7(),
            RestaurantId = restaurantId,
            ClientRequestId = form.ClientRequestId,
            StatusToken = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32)),
            BusinessDate = businessDate,
            Number = number,
            Fulfillment = form.Fulfillment,
            CustomerName = form.Name,
            CustomerPhone = form.Phone,
            DeliveryAddress = form.Address,
            DeliveryNotes = form.Notes,
            Lines = [.. lines],
            ItemsTotalCents = OrderLines.Total(lines),
            DefaultLanguageSnapshot = restaurant.DefaultLanguage,
            SubmittedAt = submittedAt,
            ExpiresAt = submittedAt + WaitingTime,
        };
        db.OnlineRequests.Add(request);
        await db.SaveChangesAsync(ct);
        // Each new submission clears its restaurant's contact data older than 30 days in the same
        // transaction, so no background job is needed. ix_online_requests_contact holds only uncleared rows.
        var cutoff = submittedAt - ContactRetention;
        await db
            .OnlineRequests.Where(r =>
                r.RestaurantId == restaurantId && r.CustomerPhone != null && r.SubmittedAt < cutoff
            )
            .ExecuteUpdateAsync(
                u =>
                    u.SetProperty(r => r.CustomerName, (string?)null)
                        .SetProperty(r => r.CustomerPhone, (string?)null)
                        .SetProperty(r => r.DeliveryAddress, (string?)null)
                        .SetProperty(r => r.DeliveryNotes, (string?)null),
                ct
            );
        // Read back PostgreSQL's timestamp precision, so a repeat returns exactly the same response.
        var saved = await StoredAsync(restaurantId, r => r.Id == request.Id, ct);
        await transaction.CommitAsync(ct);
        return new(saved!, true);
    }

    // Recovery after an unknown result: the random request ID, known only to the submitting device, is the
    // credential. 404 only means "not found yet".
    public async Task<OnlineSubmissionResponse> ByClientRequestAsync(
        string slug,
        Guid clientRequestId,
        CancellationToken ct
    )
    {
        if (!InputRules.IsSlug(slug))
            throw OnlineErrors.LinkNotFound();
        var restaurantId =
            await db
                .Restaurants.Where(r => r.Slug == slug)
                .Select(r => (Guid?)r.Id)
                .SingleOrDefaultAsync(ct)
            ?? throw OnlineErrors.LinkNotFound();
        return await StoredAsync(restaurantId, r => r.ClientRequestId == clientRequestId, ct)
            ?? throw OnlineErrors.RequestNotFound();
    }

    private Task<OnlineSubmissionResponse?> StoredAsync(
        Guid restaurantId,
        Expression<Func<OnlineRequest, bool>> match,
        CancellationToken ct
    ) =>
        db
            .OnlineRequests.AsNoTracking()
            .Where(r => r.RestaurantId == restaurantId)
            .Where(match)
            .Select(r => new OnlineSubmissionResponse(r.StatusToken, r.Number, r.ExpiresAt))
            .SingleOrDefaultAsync(ct);

    private static Form Validate(string slug, OnlineRequestInput input)
    {
        if (!InputRules.IsSlug(slug))
            throw OnlineErrors.LinkNotFound();
        if (input.ClientRequestId is not { } clientRequestId || clientRequestId == Guid.Empty)
            throw ApiException.Validation(
                "Provide a valid request ID.",
                "clientRequestId",
                "Invalid ID."
            );
        if (!ApiEnum.TryParse(input.Fulfillment, out OnlineFulfillment fulfillment))
            throw ApiException.Validation(
                "Choose PICKUP or DELIVERY.",
                "fulfillment",
                "Invalid fulfillment."
            );
        var name = InputRules.TrimToNull(input.CustomerName);
        if (name is null || name.Length > OnlineRequestConfiguration.MaxCustomerNameLength)
            throw ApiException.Validation(
                "Enter a name of at most 30 characters.",
                "customerName",
                "Invalid name."
            );
        var phone =
            InputRules.NormalizePhone(input.CustomerPhone)
            ?? throw ApiException.Validation(
                "Enter the phone as an optional + and 6-15 digits.",
                "customerPhone",
                "Invalid phone."
            );
        var address = InputRules.TrimToNull(input.DeliveryAddress);
        var notes = InputRules.TrimToNull(input.DeliveryNotes);
        if (fulfillment == OnlineFulfillment.Pickup && (address is not null || notes is not null))
            throw ApiException.Validation(
                "Pickup orders take no address.",
                "deliveryAddress",
                "Not for pickup."
            );
        if (
            fulfillment == OnlineFulfillment.Delivery
            && (
                address is null
                || address.Length > OnlineRequestConfiguration.MaxDeliveryAddressLength
            )
        )
            throw ApiException.Validation(
                "Enter an address of at most 200 characters.",
                "deliveryAddress",
                "Invalid address."
            );
        if (notes?.Length > OnlineRequestConfiguration.MaxDeliveryNotesLength)
            throw ApiException.Validation(
                "Delivery notes take at most 100 characters.",
                "deliveryNotes",
                "Invalid notes."
            );
        return new(
            clientRequestId,
            fulfillment,
            name,
            phone,
            address,
            notes,
            OrderLines.Validate(input.Items)
        );
    }

    private sealed record Form(
        Guid ClientRequestId,
        OnlineFulfillment Fulfillment,
        string Name,
        string Phone,
        string? Address,
        string? Notes,
        OrderLineInput[] Lines
    );

    private sealed record StoredResponse(
        Guid Id,
        Guid ClientRequestId,
        OnlineSubmissionResponse Response
    );
}
