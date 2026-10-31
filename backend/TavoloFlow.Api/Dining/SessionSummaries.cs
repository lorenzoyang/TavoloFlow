using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Dining;

// One visit's bill. Staff read it before closing; opening, closing and history all return it.
// TableId and TableLabel are NULL for pickup visits.
public sealed record BillSummaryResponse(Guid SessionId, string Channel, Guid? TableId, string? TableLabel, string Status,
    DateTime OpenedAt, DateTime? ClosedAt, string? CloseReason, int BillVersion, int OrderCount,
    int ItemCount, int NewItemCount, int CancelledItemCount, long TotalAmountCents);

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
                .Sum(i => i.UnitPriceCents * i.Quantity)));

    public static async Task<BillSummaryResponse> ReadAsync(ApplicationDbContext db, Guid restaurantId, Guid id,
        CancellationToken ct) =>
        await Project(db.DiningSessions.AsNoTracking().Where(s => s.RestaurantId == restaurantId && s.Id == id))
            .SingleOrDefaultAsync(ct) ?? throw DiningErrors.SessionNotFound();
}
