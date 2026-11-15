using System.Data;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Ordering;

namespace TavoloFlow.Api.Online;

// The customer's status page /o/{token}. The secret token is the only credential.
public sealed class OnlineOrderStatusService(ApplicationDbContext db, TimeProvider clock)
{
    // The link answers until this long after the order ended, then returns ONLINE_ORDER_NOT_FOUND.
    public static readonly TimeSpan LinkLifetime = TimeSpan.FromHours(24);

    public async Task<OnlineOrderStatusResponse> ReadAsync(string token, CancellationToken ct)
    {
        if (token.Length > 128)
            throw OnlineErrors.OrderNotFound();
        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.RepeatableRead,
            ct
        );
        var request =
            await db
                .OnlineRequests.AsNoTracking()
                .Include(r => r.Restaurant)
                .SingleOrDefaultAsync(r => r.StatusToken == token, ct)
            ?? throw OnlineErrors.OrderNotFound();
        var now = clock.GetUtcNow().UtcDateTime;
        var phase = OnlineRequestState.Phase(request, now);
        BillSummaryResponse? bill = null;
        OnlineOrderLineResponse[] items;
        if (request.SessionId is { } sessionId)
        {
            // Accepted: the order items carry the kitchen's progress, and the session's bill the amount.
            bill = await SessionSummaries.ReadAsync(db, request.RestaurantId, sessionId, ct);
            var lines = await db
                .OrderItems.AsNoTracking()
                .Where(i =>
                    i.RestaurantId == request.RestaurantId && i.Order.DiningSessionId == sessionId
                )
                .OrderBy(i => i.Id)
                .ToArrayAsync(ct);
            items = lines
                .Select(i => new OnlineOrderLineResponse(
                    i.ItemCodeSnapshot,
                    i.NameZhSnapshot,
                    i.NameItSnapshot,
                    i.NameEnSnapshot,
                    i.UnitPriceCents,
                    i.Quantity,
                    i.Remark,
                    OrderLineOptionResponse.ForLine(i),
                    ApiEnum.Text(i.Status)
                ))
                .ToArray();
        }
        else
            items = OnlineOrderLineResponse.ForSnapshot(request.Lines);
        await transaction.CommitAsync(ct);
        if (
            OnlineRequestState.EndedAt(request, bill?.ClosedAt, now) is { } ended
            && now >= ended + LinkLifetime
        )
            throw OnlineErrors.OrderNotFound();
        var restaurant = request.Restaurant;
        // Before acceptance the coupon applies to the submitted total; the bill takes over afterwards.
        var coupon = bill is null
            ? CouponDiscountResponse.For(
                request.CouponCode,
                request.CouponPercentOff,
                request.ItemsTotalCents
            )
            : null;
        return new(
            new(
                restaurant.Id,
                restaurant.Name,
                restaurant.Slug,
                restaurant.CurrencyCode,
                restaurant.DefaultLanguage,
                ApiEnum.Text(restaurant.Theme),
                restaurant.PublicPhone
            ),
            request.Number,
            request.CustomerName,
            ApiEnum.Text(request.Fulfillment),
            request.SubmittedAt,
            request.ExpiresAt,
            ApiEnum.Text(phase),
            request.RejectReason is { } reason ? ApiEnum.Text(reason) : null,
            request.EstimatedAt,
            bill?.Status,
            bill?.CloseReason,
            items,
            coupon,
            bill?.DeliveryFeeCents,
            bill?.TotalAmountCents ?? request.ItemsTotalCents - (coupon?.DiscountCents ?? 0)
        );
    }
}
