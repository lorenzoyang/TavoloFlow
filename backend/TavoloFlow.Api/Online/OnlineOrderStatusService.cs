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
        var phase = OnlineRequestState.Phase(request, clock.GetUtcNow().UtcDateTime);
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
            items = request
                .Lines.Select(line => new OnlineOrderLineResponse(
                    line.ItemCode,
                    line.NameZh,
                    line.NameIt,
                    line.NameEn,
                    line.UnitPriceCents,
                    line.Quantity,
                    line.Remark,
                    OrderLineOptionResponse.ForOptions(line.Options),
                    null
                ))
                .ToArray();
        await transaction.CommitAsync(ct);
        var restaurant = request.Restaurant;
        return new(
            new(
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
            bill?.TotalAmountCents ?? request.ItemsTotalCents
        );
    }
}
