using System.Linq.Expressions;
using System.Security.Cryptography;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Data.Configurations;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Ordering;
using TavoloFlow.Api.Push;

namespace TavoloFlow.Api.Online;

// Online submissions. A submission only writes an online_requests row; staff acceptance creates the
// session, order and order items later.
public sealed class OnlineRequestService(
    ApplicationDbContext db,
    TimeProvider clock,
    PushQueue push,
    IOptions<OnlineRateLimitOptions> limits,
    IOnlineVerification verification
)
{
    public static readonly TimeSpan WaitingTime = TimeSpan.FromMinutes(10);

    // New successful submissions clear contact data submitted more than this long ago.
    public static readonly TimeSpan ContactRetention = TimeSpan.FromDays(30);

    // Lock order: restaurant SHARE, the restaurant's submission advisory lock, then the day's counter.
    // Menu writers take restaurant UPDATE, so prices and snapshots stay stable. The submission lock
    // serializes duplicate and cap checks across midnight too; a daily counter alone cannot do that.
    public async Task<OnlineSubmission> SubmitAsync(
        string slug,
        OnlineRequestInput input,
        OnlineSubmissionSource source,
        CancellationToken ct
    )
    {
        var form = Validate(slug, input);
        var restaurantId =
            await db
                .Restaurants.Where(r => r.Slug == slug)
                .Select(r => (Guid?)r.Id)
                .SingleOrDefaultAsync(ct)
            ?? throw OnlineErrors.LinkNotFound();
        // Fast recovery needs no external verification. A missing result is not proof of absence:
        // another request may still be in flight, so the transaction repeats this check below.
        var stored = await StoredAsync(
            restaurantId,
            r => r.ClientRequestId == form.ClientRequestId,
            ct
        );
        if (stored is not null)
            return new(stored, false);
        await verification.VerifyAsync(
            restaurantId,
            form.ClientRequestId,
            input.TurnstileToken,
            ct
        );
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var restaurant = await RowLocks.RestaurantAsync(db, restaurantId, RowLock.Share, ct);
        // The platform may have changed the link meanwhile.
        if (restaurant?.Slug != slug)
            throw OnlineErrors.LinkNotFound();
        var submissionLock = $"tavoloflow:online-submission:{restaurantId:D}";
        await db.Database.ExecuteSqlAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({submissionLock}, 0))",
            ct
        );
        // Take the time after waiting, so the business date and gates describe this submission's turn.
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

        var browserKey = OnlineSubmissionSource.Key(restaurantId, source.BrowserId);
        var ipKey = OnlineSubmissionSource.Key(restaurantId, source.IpAddress);
        // The existing waiting index bounds these reads to at most twenty current requests.
        // Both checks share the cross-day submission lock with the eventual insert.
        var existing = await PendingAsync(restaurantId, browserKey, now.UtcDateTime, ct);
        if (existing is not null)
            throw OnlineErrors.BrowserPending(existing);
        if (
            await db
                .OnlineRequests.Waiting(restaurantId, now.UtcDateTime)
                .CountAsync(r => r.IpKey == ipKey, ct) >= limits.Value.MaxWaitingPerIp
        )
            throw OnlineErrors.IpWaitingLimit();

        var (_, availability) = await OnlineAvailability.ReadAsync(db, restaurant, now, ct);
        if (!availability.IsOpen)
            throw OnlineErrors.NotOpen(availability);
        // Delivery is the OWNER's switch; it never closes pickup.
        if (form.Fulfillment == OnlineFulfillment.Delivery && !restaurant.DeliveryEnabled)
            throw OnlineErrors.DeliveryNotOffered();
        // Coupon writes take restaurant UPDATE, so this SHARE lock sees the coupon whole or not at all.
        // Acceptance never checks it again: the customer was promised this total.
        if (form.Coupon is { } wanted)
        {
            var coupon = await db
                .OnlineCoupons.AsNoTracking()
                .SingleOrDefaultAsync(
                    c => c.RestaurantId == restaurantId && c.Code == wanted.Code,
                    ct
                );
            if (
                coupon is null
                || !OnlineCoupons.IsValid(coupon, businessDate)
                || coupon.PercentOff != wanted.PercentOff
            )
                throw OnlineErrors.CouponInvalid();
        }
        var lines = await OrderLines.SnapshotAsync(db, restaurantId, form.Lines, ct);
        var submittedAt = now.UtcDateTime;
        var request = new OnlineRequest
        {
            Id = Guid.CreateVersion7(),
            RestaurantId = restaurantId,
            ClientRequestId = form.ClientRequestId,
            BrowserKey = browserKey,
            IpKey = ipKey,
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
            CouponCode = form.Coupon?.Code,
            CouponPercentOff = form.Coupon?.PercentOff,
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
                        .SetProperty(r => r.DeliveryNotes, (string?)null)
                        .SetProperty(r => r.BrowserKey, (string?)null)
                        .SetProperty(r => r.IpKey, (string?)null),
                ct
            );
        // Read back PostgreSQL's timestamp precision, so a repeat returns exactly the same response.
        var saved = await StoredAsync(restaurantId, r => r.Id == request.Id, ct);
        await transaction.CommitAsync(ct);
        // Only a committed first submission notifies staff devices; repeats and rejections never do.
        push.Enqueue(new(restaurantId, number, request.ExpiresAt));
        return new(saved!, true);
    }

    public async Task<OnlineOrderingContextResponse> ContextAsync(
        string slug,
        string browserId,
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
        return new(
            await PendingAsync(
                restaurantId,
                OnlineSubmissionSource.Key(restaurantId, browserId),
                clock.GetUtcNow().UtcDateTime,
                ct
            )
        );
    }

    private Task<OnlineSubmissionResponse?> PendingAsync(
        Guid restaurantId,
        string browserKey,
        DateTime now,
        CancellationToken ct
    ) =>
        db
            .OnlineRequests.AsNoTracking()
            .Waiting(restaurantId, now)
            .Where(r => r.BrowserKey == browserKey)
            .OrderBy(r => r.SubmittedAt)
            .ThenBy(r => r.Id)
            .Select(r => new OnlineSubmissionResponse(r.StatusToken, r.Number, r.ExpiresAt))
            .FirstOrDefaultAsync(ct);

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
        Coupon? coupon = null;
        if (input.Coupon is { } wanted)
            coupon =
                OnlineCoupons.Normalize(wanted.Code) is { } code
                && OnlineCoupons.ValidPercent(wanted.PercentOff)
                    ? new(code, wanted.PercentOff!.Value)
                    : throw ApiException.Validation(
                        "Send the coupon's code and its confirmed percentage, or null for none.",
                        "coupon",
                        "Invalid coupon."
                    );
        return new(
            clientRequestId,
            fulfillment,
            name,
            phone,
            address,
            notes,
            OrderLines.Validate(input.Items),
            coupon
        );
    }

    private sealed record Coupon(string Code, int PercentOff);

    private sealed record Form(
        Guid ClientRequestId,
        OnlineFulfillment Fulfillment,
        string Name,
        string Phone,
        string? Address,
        string? Notes,
        OrderLineInput[] Lines,
        Coupon? Coupon
    );

    private sealed record StoredResponse(
        Guid Id,
        Guid ClientRequestId,
        OnlineSubmissionResponse Response
    );
}
