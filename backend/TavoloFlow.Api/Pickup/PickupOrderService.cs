using System.Data;
using System.Security.Cryptography;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Menus;
using TavoloFlow.Api.Ordering;

namespace TavoloFlow.Api.Pickup;

// The guest side of online pickup: the menu behind /r/{slug}, submissions, their recovery and the status page.
// All of it is anonymous; the status token and the client request id each read one request and nothing else.
public sealed class PickupOrderService(ApplicationDbContext db, TimeProvider clock)
{
    // One Repeatable Read snapshot of the restaurant, its hours and its menu, like the QR bootstrap.
    public async Task<OnlineMenuResponse> MenuAsync(string slug, CancellationToken ct)
    {
        if (!InputRules.IsSlug(slug)) throw PickupErrors.MenuLinkNotFound();
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var restaurant = await db.Restaurants.AsNoTracking().SingleOrDefaultAsync(r => r.Slug == slug, ct)
            ?? throw PickupErrors.MenuLinkNotFound();
        var availability = await AvailabilityAsync(restaurant, Now(), ct);
        var menu = await MenuReader.ReadAsync(db, restaurant.Id, restaurant.DefaultLanguage, ct);
        await tx.CommitAsync(ct);
        return new(new(restaurant.Id, restaurant.Name, restaurant.CurrencyCode, restaurant.DefaultLanguage,
                ApiEnum.Text(restaurant.Theme), restaurant.Phone),
            new(ApiEnum.Text(availability.Status), availability.NextOpensAt),
            new(menu.AvailableLanguages, menu.Categories, menu.Items));
    }

    public async Task<PickupSubmission> SubmitAsync(string slug, PickupRequestInput input, CancellationToken ct)
    {
        if (input.ClientRequestId is null || input.ClientRequestId == Guid.Empty)
            throw ApiException.Validation("请提供有效的请求标识。");
        var name = CustomerName(input.CustomerName);
        var phone = InputRules.NormalizePhone(input.CustomerPhone)
            ?? throw ApiException.Validation("请检查联系方式。", "customerPhone", "电话须为可选的 + 加 6–15 位数字。");
        var lines = OrderLines.Validate(input.Items);
        if (!InputRules.IsSlug(slug)) throw PickupErrors.MenuLinkNotFound();
        var restaurantId = await db.Restaurants.Where(r => r.Slug == slug).Select(r => (Guid?)r.Id).SingleOrDefaultAsync(ct)
            ?? throw PickupErrors.MenuLinkNotFound();

        while (true)
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            // Menu writers, item deletion and every pickup or service setting take restaurant UPDATE, so prices,
            // snapshots, hours and switches stay as read here until this request is saved.
            var restaurant = await RowLocks.RestaurantAsync(db, restaurantId, RowLock.Share, ct);
            if (restaurant?.Slug != slug) throw PickupErrors.MenuLinkNotFound();
            await RowLocks.PickupSubmissionAsync(db, restaurantId, ct);
            var now = Now();
            var zone = TimeZoneInfo.FindSystemTimeZoneById(restaurant.TimeZone);
            var businessDate = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(now, zone));
            // Reserve a number only inside this transaction; failures and duplicate lookups give it back.
            var number = (await db.Database.SqlQuery<int>($"""
                INSERT INTO pickup_counters (restaurant_id, business_date, last_number) VALUES ({restaurantId}, {businessDate}, 1)
                ON CONFLICT (restaurant_id, business_date) DO UPDATE SET last_number = pickup_counters.last_number + 1
                RETURNING last_number AS "Value"
                """).ToListAsync(ct)).Single();
            var original = await db.PickupRequests.AsNoTracking()
                .SingleOrDefaultAsync(r => r.RestaurantId == restaurantId && r.ClientRequestId == input.ClientRequestId, ct);
            // A repeat returns the stored request before any gate, like guest orders; leaving without commit
            // also gives the number back.
            if (original is not null) return new(PickupSubmissionResponse.From(original), false);

            // A counter can also be held by maintenance. Recheck the clock after waiting: neither hours
            // nor the pending count may use the time from before that wait. A new day needs its own number.
            now = Now();
            if (businessDate != DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(now, zone))) continue;

            var availability = await AvailabilityAsync(restaurant, now, ct);
            switch (availability.Status)
            {
                case PickupStatus.Suspended: throw new ApiException(409, "SERVICE_SUSPENDED", "餐厅服务已暂停。");
                case PickupStatus.NotOffered: throw PickupErrors.NotOffered();
                case PickupStatus.Paused: throw new ApiException(409, "PICKUP_PAUSED", "餐厅暂停了线上接单，请稍后再试。");
                case PickupStatus.ClosedHours:
                    throw new ApiException(409, "PICKUP_CLOSED", "现在不在接单时间。")
                        { Extensions = new() { ["nextOpensAt"] = availability.NextOpensAt } };
            }
            if (await PickupState.Pending(db.PickupRequests.Where(r => r.RestaurantId == restaurantId), now).CountAsync(ct)
                >= PickupState.PendingLimit)
                throw new ApiException(409, "PICKUP_BUSY", "餐厅现在订单太多，请稍后再试。");
            var (snapshots, total) = await OrderLines.BuildAsync(db, restaurantId, lines, ct);

            var request = new PickupRequest
            {
                Id = Guid.CreateVersion7(), RestaurantId = restaurantId, ClientRequestId = input.ClientRequestId.Value,
                StatusToken = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32)), BusinessDate = businessDate,
                PickupNumber = number, CustomerName = name, CustomerPhone = phone, TotalAmountCents = total,
                DefaultLanguageSnapshot = restaurant.DefaultLanguage, SubmittedAt = now, ExpiresAt = now + PickupState.Lifetime
            };
            foreach (var line in snapshots) request.Items.Add(line.ToPickupRequestItem(restaurantId));
            db.PickupRequests.Add(request);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return new(PickupSubmissionResponse.From(request), true);
        }
    }

    // The random client request id only this device knows is itself the credential. 404 means "not found yet".
    public async Task<PickupSubmissionResponse> ByClientIdAsync(string slug, Guid clientRequestId, CancellationToken ct)
    {
        if (!InputRules.IsSlug(slug)) throw PickupErrors.NotFound();
        var request = await db.PickupRequests.AsNoTracking()
            .SingleOrDefaultAsync(r => r.Restaurant.Slug == slug && r.ClientRequestId == clientRequestId, ct)
            ?? throw PickupErrors.NotFound();
        return PickupSubmissionResponse.From(request);
    }

    public async Task<PickupStatusResponse> StatusAsync(string token, CancellationToken ct)
    {
        if (token.Length is < 1 or > 64) throw PickupErrors.NotFound();
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var request = await db.PickupRequests.AsNoTracking().AsSplitQuery()
            .Include(r => r.Restaurant).Include(r => r.Items)
            .Include(r => r.Session).ThenInclude(s => s!.Orders).ThenInclude(o => o.Items)
            .SingleOrDefaultAsync(r => r.StatusToken == token, ct) ?? throw PickupErrors.NotFound();
        await tx.CommitAsync(ct);
        var now = Now();
        var state = PickupState.Of(request, now);
        var session = request.Session;
        DateTime? endedAt = state switch
        {
            PickupRequestState.Expired => request.ExpiresAt,
            PickupRequestState.Rejected => request.RejectedAt,
            _ => session?.ClosedAt
        };
        // A finished request stops being readable a day later, so a guest's name is not exposed for ever.
        if (endedAt is not null && now >= endedAt.Value + PickupState.StatusRetention) throw PickupErrors.NotFound();

        PickupStatusLine[] lines;
        long payable;
        string status;
        if (session is null)
        {
            lines = request.Items.OrderBy(i => i.Id).Select(i => new PickupStatusLine(i.ItemCodeSnapshot, i.NameZhSnapshot,
                i.NameItSnapshot, i.NameEnSnapshot, i.UnitPriceCents, i.Quantity, i.Remark, false)).ToArray();
            payable = request.TotalAmountCents;
            status = ApiEnum.Text(state);
        }
        else
        {
            var items = session.Orders.SelectMany(o => o.Items).OrderBy(i => i.Id).ToArray();
            lines = items.Select(i => new PickupStatusLine(i.ItemCodeSnapshot, i.NameZhSnapshot, i.NameItSnapshot,
                i.NameEnSnapshot, i.UnitPriceCents, i.Quantity, i.Remark, i.Status == OrderItemStatus.Cancelled)).ToArray();
            payable = session.ClosedTotalCents ?? items.Where(i => i.Status != OrderItemStatus.Cancelled)
                .Sum(i => i.UnitPriceCents * i.Quantity);
            status = session.Status == DiningSessionStatus.Closed
                ? session.CloseReason == SessionCloseReason.Paid ? "PICKED_UP" : "CLOSED"
                : items.All(i => i.Status == OrderItemStatus.Cancelled) ? "CANCELLED"
                : items.Any(i => i.Status == OrderItemStatus.New) ? "ACCEPTED"
                : "READY";
        }
        var restaurant = request.Restaurant;
        return new(new(restaurant.Id, restaurant.Name, restaurant.DefaultLanguage, ApiEnum.Text(restaurant.Theme),
                restaurant.Phone, restaurant.Slug),
            request.PickupNumber, request.CustomerName, request.SubmittedAt, request.ExpiresAt, request.EstimatedReadyAt,
            status, request.RejectReason is { } reason ? ApiEnum.Text(reason) : null, lines, payable);
    }

    private async Task<PickupAvailability> AvailabilityAsync(Restaurant restaurant, DateTime now, CancellationToken ct)
    {
        var hours = await db.PickupHours.AsNoTracking().Where(h => h.RestaurantId == restaurant.Id).ToArrayAsync(ct);
        return PickupHours.Availability(restaurant, hours, now);
    }

    // PostgreSQL keeps microseconds; trimming here makes a first response equal every later read of it.
    private DateTime Now()
    {
        var now = clock.GetUtcNow().UtcDateTime;
        return now.AddTicks(-(now.Ticks % 10));
    }

    // Trimmed, 1–20 characters on one line: it heads the kitchen card and the pass screen.
    private static string CustomerName(string? input)
    {
        var name = InputRules.TrimToNull(input);
        if (name is null || name.Length > 20 || name.Any(char.IsControl))
            throw ApiException.Validation("请检查联系方式。", "customerName", "姓名须为 1–20 个字符。");
        return name;
    }
}
