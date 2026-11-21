using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Online;
using TavoloFlow.Api.Ordering;

namespace TavoloFlow.Api.Kitchen;

// TableLabel is set for dine-in, Online for pickup and delivery (Channel says which).
public sealed record KitchenOrderResponse(
    Guid Id,
    Guid SessionId,
    string Channel,
    string? TableLabel,
    OnlineTicketResponse? Online,
    string Status,
    DateTime CreatedAt,
    DateTime? ProcessedAt,
    string DefaultLanguage,
    long TotalAmountCents,
    long PayableAmountCents,
    OrderLineResponse[] Items,
    bool IsStaffPlaced,
    DateTime QueuedAt
)
{
    // Requires Items, DiningSession and its OnlineRequest to be loaded.
    public static KitchenOrderResponse From(Order order) =>
        new(
            order.Id,
            order.DiningSessionId,
            ApiEnum.Text(order.DiningSession.Channel),
            order.DiningSession.TableLabelSnapshot,
            OnlineTicketResponse.For(order.DiningSession),
            ApiEnum.Text(order.Status),
            order.CreatedAt,
            order.ProcessedAt,
            order.DefaultLanguageSnapshot,
            order.TotalAmountCents,
            OrderResponse.Payable(order),
            OrderLineResponse.ForOrder(order),
            order.IsStaffPlaced,
            order.KitchenQueueAt
        );
}

// The watermark spans statuses and closed sessions. Only work reaching the kitchen advances it.
public sealed record KitchenPage(
    KitchenOrderResponse[] Items,
    string? NextCursor,
    long TotalCount,
    long PendingCount,
    DateTime? LatestQueuedAt
)
{
    // Older staff tabs use this property until the next app reload.
    public DateTime? LatestCreatedAt => LatestQueuedAt;
}

public sealed record PassItemResponse(
    Guid Id,
    Guid OrderId,
    Guid SessionId,
    string Channel,
    string? TableLabel,
    OnlineTicketResponse? Online,
    string DefaultLanguage,
    string? ItemCode,
    string? NameZh,
    string? NameIt,
    string? NameEn,
    int Quantity,
    string? Remark,
    OrderLineOptionResponse[] Options,
    DateTime ReadyAt,
    DateTime? ServedAt
)
{
    // Requires Order, its DiningSession and the session's OnlineRequest to be loaded.
    public static PassItemResponse From(OrderItem item) =>
        new(
            item.Id,
            item.OrderId,
            item.Order.DiningSessionId,
            ApiEnum.Text(item.Order.DiningSession.Channel),
            item.Order.DiningSession.TableLabelSnapshot,
            OnlineTicketResponse.For(item.Order.DiningSession),
            item.Order.DefaultLanguageSnapshot,
            item.ItemCodeSnapshot,
            item.NameZhSnapshot,
            item.NameItSnapshot,
            item.NameEnSnapshot,
            item.Quantity,
            item.Remark,
            OrderLineOptionResponse.ForLine(item),
            item.ReadyAt!.Value,
            item.ServedAt
        );
}

// LatestReadyAt is the newest waiting item's ready time, restaurant-wide: it advances only when a dish is made ready.
public sealed record PassPage(
    PassItemResponse[] Items,
    string? NextCursor,
    long TotalCount,
    DateTime? LatestReadyAt
);
