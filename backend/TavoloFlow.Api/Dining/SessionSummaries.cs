using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Online;

namespace TavoloFlow.Api.Dining;

// One visit's bill. Staff read it before closing; opening, closing and history all return it.
// TableId and TableLabel belong to dine-in, Online to pickup and delivery (Channel says which).
// DeliveryFeeCents is set on delivery only; TotalAmountCents already includes it while it counts, and
// already takes off an online coupon (Online.Coupon).
public sealed record BillSummaryResponse(
    Guid SessionId,
    string Channel,
    Guid? TableId,
    string? TableLabel,
    OnlineBillResponse? Online,
    string Status,
    DateTime OpenedAt,
    DateTime? ClosedAt,
    string? CloseReason,
    long? DeliveryFeeCents,
    int BillVersion,
    int OrderCount,
    int ItemCount,
    int NewItemCount,
    int CancelledItemCount,
    long TotalAmountCents
);

public static class SessionSummaries
{
    // Counts and sums run in SQL. A closed visit reports its stored total. An active one sums its
    // non-cancelled order items, takes an online coupon's percentage off them (rounded down, as in
    // OnlineCoupons.DiscountCents) and adds the delivery fee, which stops counting once every dish is
    // cancelled: a fully cancelled delivery still closes as VOIDED at zero. This is the only place that
    // computes a bill amount. ApiEnum.Text runs on the client, which EF Core allows in the final projection.
    public static IQueryable<BillSummaryResponse> Project(IQueryable<DiningSession> sessions) =>
        sessions
            .Select(s => new
            {
                Session = s,
                Charged = s
                    .Orders.SelectMany(o => o.Items)
                    .Where(i => i.Status != OrderItemStatus.Cancelled)
                    .Sum(i => i.UnitPriceCents * i.Quantity),
                Percent = s.OnlineRequest == null ? null : s.OnlineRequest.CouponPercentOff,
            })
            .Select(x => new BillSummaryResponse(
                x.Session.Id,
                ApiEnum.Text(x.Session.Channel),
                x.Session.TableId,
                x.Session.TableLabelSnapshot,
                x.Session.OnlineRequest == null
                    ? null
                    : new OnlineBillResponse(
                        x.Session.OnlineRequest.Number,
                        x.Session.OnlineRequest.CustomerName,
                        x.Session.OnlineRequest.CustomerPhone,
                        x.Session.OnlineRequest.EstimatedAt!.Value,
                        x.Session.OnlineRequest.DeliveryAddress,
                        x.Session.OnlineRequest.DeliveryNotes,
                        x.Percent == null
                            ? null
                            : new CouponDiscountResponse(
                                x.Session.OnlineRequest.CouponCode!,
                                x.Percent.Value,
                                x.Charged * x.Percent.Value / 100
                            ),
                        x.Session.OnlineRequest.RequestedPickupAt,
                        x.Session.Orders.Max(o => o.KitchenStartsAt)
                    ),
                ApiEnum.Text(x.Session.Status),
                x.Session.OpenedAt,
                x.Session.ClosedAt,
                x.Session.CloseReason == null ? null : ApiEnum.Text(x.Session.CloseReason.Value),
                x.Session.DeliveryFeeCents,
                x.Session.BillVersion,
                x.Session.Orders.Count,
                x.Session.Orders.SelectMany(o => o.Items).Count(),
                x.Session.Orders.SelectMany(o => o.Items)
                    .Count(i => i.Status == OrderItemStatus.New),
                x.Session.Orders.SelectMany(o => o.Items)
                    .Count(i => i.Status == OrderItemStatus.Cancelled),
                x.Session.ClosedTotalCents
                    ?? x.Charged
                        - (x.Percent == null ? 0 : x.Charged * x.Percent.Value / 100)
                        + (
                            x.Session.DeliveryFeeCents != null
                            && x.Session.Orders.SelectMany(o => o.Items)
                                .Any(i => i.Status != OrderItemStatus.Cancelled)
                                ? x.Session.DeliveryFeeCents.Value
                                : 0
                        )
            ));

    public static async Task<BillSummaryResponse> ReadAsync(
        ApplicationDbContext db,
        Guid restaurantId,
        Guid id,
        CancellationToken ct
    ) =>
        await Project(
                db.DiningSessions.AsNoTracking()
                    .Where(s => s.RestaurantId == restaurantId && s.Id == id)
            )
            .SingleOrDefaultAsync(ct)
        ?? throw DiningErrors.SessionNotFound();
}
