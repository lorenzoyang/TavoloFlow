using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Ordering;

namespace TavoloFlow.Api.Kitchen;

// How kitchen and pass name a pickup visit: the pickup number first, the name only to help.
public sealed record SessionPickupResponse(int Number, string CustomerName, DateTime EstimatedReadyAt)
{
    public static SessionPickupResponse? From(DiningSession session) => session.PickupRequest is { } r
        ? new(r.PickupNumber, r.CustomerName, r.EstimatedReadyAt!.Value) : null;
}

// TableLabel is NULL and Pickup is set for pickup visits.
public sealed record KitchenOrderResponse(Guid Id, Guid SessionId, string Channel, string? TableLabel,
    SessionPickupResponse? Pickup, string Status, DateTime CreatedAt, DateTime? ProcessedAt,
    string DefaultLanguage, long TotalAmountCents, long PayableAmountCents, OrderLineResponse[] Items)
{
    // Requires Items and DiningSession with its PickupRequest to be loaded.
    public static KitchenOrderResponse From(Order order) => new(order.Id, order.DiningSessionId,
        ApiEnum.Text(order.DiningSession.Channel), order.DiningSession.TableLabelSnapshot,
        SessionPickupResponse.From(order.DiningSession), ApiEnum.Text(order.Status), order.CreatedAt, order.ProcessedAt,
        order.DefaultLanguageSnapshot, order.TotalAmountCents, OrderResponse.Payable(order),
        OrderLineResponse.ForOrder(order));
}

// LatestCreatedAt is the newest order's creation time, restaurant-wide: it advances only when an order is submitted.
public sealed record KitchenPage(KitchenOrderResponse[] Items, string? NextCursor,
    long TotalCount, long PendingCount, DateTime? LatestCreatedAt);

public sealed record PassItemResponse(Guid Id, Guid OrderId, Guid SessionId, string Channel, string? TableLabel,
    SessionPickupResponse? Pickup, string DefaultLanguage,
    string? ItemCode, string? NameZh, string? NameIt, string? NameEn, int Quantity, string? Remark,
    DateTime ReadyAt, DateTime? ServedAt)
{
    // Requires Order, its DiningSession and that session's PickupRequest to be loaded.
    public static PassItemResponse From(OrderItem item) => new(item.Id, item.OrderId, item.Order.DiningSessionId,
        ApiEnum.Text(item.Order.DiningSession.Channel), item.Order.DiningSession.TableLabelSnapshot,
        SessionPickupResponse.From(item.Order.DiningSession), item.Order.DefaultLanguageSnapshot, item.ItemCodeSnapshot,
        item.NameZhSnapshot, item.NameItSnapshot, item.NameEnSnapshot, item.Quantity, item.Remark,
        item.ReadyAt!.Value, item.ServedAt);
}

// LatestReadyAt is the newest waiting item's ready time, restaurant-wide: it advances only when a dish is made ready.
public sealed record PassPage(PassItemResponse[] Items, string? NextCursor, long TotalCount, DateTime? LatestReadyAt);
