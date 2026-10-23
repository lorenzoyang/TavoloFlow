using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Ordering;

namespace TavoloFlow.Api.Kitchen;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CancelOrderInput([Required] string? ExpectedStatus, [Required] string? Reason);

public sealed record KitchenOrderResponse(Guid Id, Guid SessionId, string TableLabel, string Status,
    DateTime CreatedAt, DateTime? ReadyAt, DateTime? CancelledAt, string? CancelReason,
    string DefaultLanguage, long TotalAmountCents, string? OrderNote, OrderLineResponse[] Items)
{
    // Requires Items and DiningSession to be loaded.
    public static KitchenOrderResponse From(Order order) => new(order.Id, order.DiningSessionId,
        order.DiningSession.TableLabelSnapshot, ApiEnum.Text(order.Status), order.CreatedAt, order.ReadyAt,
        order.CancelledAt, order.CancelReason, order.DefaultLanguageSnapshot, order.TotalAmountCents,
        order.OrderNote, OrderLineResponse.ForOrder(order));
}

public sealed record KitchenPage(KitchenOrderResponse[] Items, string? NextCursor,
    long TotalCount, long PendingCount, long CreatedOrderCount);
