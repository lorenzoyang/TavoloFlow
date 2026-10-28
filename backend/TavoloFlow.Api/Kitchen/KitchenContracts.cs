using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Ordering;

namespace TavoloFlow.Api.Kitchen;

public sealed record KitchenOrderResponse(Guid Id, Guid SessionId, string TableLabel, string Status,
    DateTime CreatedAt, DateTime? ProcessedAt,
    string DefaultLanguage, long TotalAmountCents, long PayableAmountCents, OrderLineResponse[] Items)
{
    // Requires Items and DiningSession to be loaded.
    public static KitchenOrderResponse From(Order order) => new(order.Id, order.DiningSessionId,
        order.DiningSession.TableLabelSnapshot, ApiEnum.Text(order.Status), order.CreatedAt, order.ProcessedAt,
        order.DefaultLanguageSnapshot, order.TotalAmountCents, OrderResponse.Payable(order),
        OrderLineResponse.ForOrder(order));
}

public sealed record KitchenPage(KitchenOrderResponse[] Items, string? NextCursor,
    long TotalCount, long PendingCount, long CreatedOrderCount);

public sealed record PassItemResponse(Guid Id, Guid OrderId, Guid SessionId, string TableLabel, string DefaultLanguage,
    string? ItemCode, string? NameZh, string? NameIt, string? NameEn, int Quantity, string? Remark,
    DateTime ReadyAt, DateTime? ServedAt)
{
    // Requires Order and its DiningSession to be loaded.
    public static PassItemResponse From(OrderItem item) => new(item.Id, item.OrderId, item.Order.DiningSessionId,
        item.Order.DiningSession.TableLabelSnapshot, item.Order.DefaultLanguageSnapshot, item.ItemCodeSnapshot,
        item.NameZhSnapshot, item.NameItSnapshot, item.NameEnSnapshot, item.Quantity, item.Remark,
        item.ReadyAt!.Value, item.ServedAt);
}

// LatestReadyAt is the newest waiting item's ready time, restaurant-wide: it advances only when a dish is made ready.
public sealed record PassPage(PassItemResponse[] Items, string? NextCursor, long TotalCount, DateTime? LatestReadyAt);
