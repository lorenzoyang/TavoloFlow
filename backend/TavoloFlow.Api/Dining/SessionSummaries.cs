using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Dining;

// One visit's bill. Staff read it before closing; opening, closing and history all return it.
// The bill's pickup details: staff collecting the money may need to call the guest.
public sealed record BillPickupResponse(int Number, string CustomerName, string CustomerPhone, DateTime EstimatedReadyAt);

// TableId and TableLabel are NULL and Pickup is set for pickup visits.
public sealed record BillSummaryResponse(Guid SessionId, string Channel, Guid? TableId, string? TableLabel, string Status,
    DateTime OpenedAt, DateTime? ClosedAt, string? CloseReason, int BillVersion, int OrderCount,
    int ItemCount, int NewItemCount, int CancelledItemCount, long TotalAmountCents, BillPickupResponse? Pickup);

public static class SessionSummaries
{
    // Counts and sums run in SQL. A closed visit reports its stored total; an active one sums its
    // non-cancelled order items. ApiEnum.Text runs on the client, which EF Core allows in the final projection.
    public static IQueryable<BillSummaryResponse> Project(IQueryable<DiningSession> sessions) => sessions.Select(s =>
        new BillSummaryResponse(s.Id, ApiEnum.Text(s.Channel), s.TableId, s.TableLabelSnapshot, ApiEnum.Text(s.Status), s.OpenedAt, s.ClosedAt,
            s.CloseReason == null ? null : ApiEnum.Text(s.CloseReason.Value), s.BillVersion, s.Orders.Count,
            s.Orders.SelectMany(o => o.Items).Count(),
            s.Orders.SelectMany(o => o.Items).Count(i => i.Status == OrderItemStatus.New),
            s.Orders.SelectMany(o => o.Items).Count(i => i.Status == OrderItemStatus.Cancelled),
            s.ClosedTotalCents ?? s.Orders.SelectMany(o => o.Items).Where(i => i.Status != OrderItemStatus.Cancelled)
                .Sum(i => i.UnitPriceCents * i.Quantity),
            s.PickupRequest == null ? null : new BillPickupResponse(s.PickupRequest.PickupNumber, s.PickupRequest.CustomerName,
                s.PickupRequest.CustomerPhone, s.PickupRequest.EstimatedReadyAt!.Value)));

    public static async Task<BillSummaryResponse> ReadAsync(ApplicationDbContext db, Guid restaurantId, Guid id,
        CancellationToken ct) =>
        await Project(db.DiningSessions.AsNoTracking().Where(s => s.RestaurantId == restaurantId && s.Id == id))
            .SingleOrDefaultAsync(ct) ?? throw DiningErrors.SessionNotFound();
}
