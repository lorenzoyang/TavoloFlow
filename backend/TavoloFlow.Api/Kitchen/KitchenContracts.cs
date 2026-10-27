using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Ordering;

namespace TavoloFlow.Api.Kitchen;

public sealed record KitchenOrderResponse(Guid Id, Guid SessionId, string TableLabel, string Status,
    DateTime CreatedAt, DateTime? ProcessedAt, string? CancelReason,
    string DefaultLanguage, long TotalAmountCents, long PayableAmountCents, string? OrderNote, OrderLineResponse[] Items)
{
    // Requires Items and DiningSession to be loaded. CancelReason is historical only.
    public static KitchenOrderResponse From(Order order) => new(order.Id, order.DiningSessionId,
        order.DiningSession.TableLabelSnapshot, ApiEnum.Text(order.Status), order.CreatedAt, order.ProcessedAt,
        order.CancelReason, order.DefaultLanguageSnapshot, order.TotalAmountCents, OrderResponse.Payable(order),
        order.OrderNote, OrderLineResponse.ForOrder(order));
}

public sealed record KitchenPage(KitchenOrderResponse[] Items, string? NextCursor,
    long TotalCount, long PendingCount, long CreatedOrderCount);
