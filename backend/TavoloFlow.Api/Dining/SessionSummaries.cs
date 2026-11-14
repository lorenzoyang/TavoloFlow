using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Online;

namespace TavoloFlow.Api.Dining;

// One visit's bill. Staff read it before closing; opening, closing and history all return it.
// TableId and TableLabel belong to dine-in, Online to pickup and delivery (Channel says which).
// DeliveryFeeCents is set on delivery only; TotalAmountCents already includes it while it counts.
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
    // non-cancelled order items plus the delivery fee, which stops counting once every dish is cancelled:
    // a fully cancelled delivery still closes as VOIDED at zero. This is the only place that computes a
    // bill amount. ApiEnum.Text runs on the client, which EF Core allows in the final projection.
    public static IQueryable<BillSummaryResponse> Project(IQueryable<DiningSession> sessions) =>
        sessions.Select(s => new BillSummaryResponse(
            s.Id,
            ApiEnum.Text(s.Channel),
            s.TableId,
            s.TableLabelSnapshot,
            s.OnlineRequest == null
                ? null
                : new OnlineBillResponse(
                    s.OnlineRequest.Number,
                    s.OnlineRequest.CustomerName,
                    s.OnlineRequest.CustomerPhone,
                    s.OnlineRequest.EstimatedAt!.Value,
                    s.OnlineRequest.DeliveryAddress,
                    s.OnlineRequest.DeliveryNotes
                ),
            ApiEnum.Text(s.Status),
            s.OpenedAt,
            s.ClosedAt,
            s.CloseReason == null ? null : ApiEnum.Text(s.CloseReason.Value),
            s.DeliveryFeeCents,
            s.BillVersion,
            s.Orders.Count,
            s.Orders.SelectMany(o => o.Items).Count(),
            s.Orders.SelectMany(o => o.Items).Count(i => i.Status == OrderItemStatus.New),
            s.Orders.SelectMany(o => o.Items).Count(i => i.Status == OrderItemStatus.Cancelled),
            s.ClosedTotalCents
                ?? s.Orders.SelectMany(o => o.Items)
                    .Where(i => i.Status != OrderItemStatus.Cancelled)
                    .Sum(i => i.UnitPriceCents * i.Quantity)
                    + (
                        s.DeliveryFeeCents != null
                        && s.Orders.SelectMany(o => o.Items)
                            .Any(i => i.Status != OrderItemStatus.Cancelled)
                            ? s.DeliveryFeeCents.Value
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
