using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Ordering;

namespace TavoloFlow.Api.Kitchen;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CancelOrderInput([Required] string? ExpectedStatus, [Required] string? Reason);

public sealed record KitchenOrderResponse(Guid Id, Guid SessionId, string TableLabel, string Status,
    DateTime CreatedAt, DateTime? ReadyAt, DateTime? CancelledAt, string? CancelReason,
    string DefaultLanguage, long TotalAmountCents, string? OrderNote, OrderLineResponse[] Items)
{
    public static KitchenOrderResponse From(Order order)
    {
        var snapshot = OrderResponse.From(order);
        return new(snapshot.Id, snapshot.SessionId, order.DiningSession.TableLabelSnapshot, snapshot.Status,
            snapshot.CreatedAt, order.ReadyAt, order.CancelledAt, order.CancelReason, snapshot.DefaultLanguage,
            snapshot.TotalAmountCents, snapshot.OrderNote, snapshot.Items);
    }
}

public sealed record KitchenPage(KitchenOrderResponse[] Items, string? NextCursor,
    long TotalCount, long PendingCount, long CreatedOrderCount);
