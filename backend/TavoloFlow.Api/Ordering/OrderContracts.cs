using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Ordering;

// Only the envelope is validated before recovery. A persisted request takes precedence over its resent contents.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CreateOrderInput(
    [Required] Guid? SessionId,
    [Required] Guid? ClientRequestId,
    OrderLineInput?[]? Items
);

// ExpectedUnitPriceCents includes the chosen options' deltas; OptionIds is empty for a dish without options.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record OrderLineInput(
    Guid MenuItemId,
    int Quantity,
    long ExpectedUnitPriceCents,
    string? Remark,
    Guid[]? OptionIds
);

public sealed record OrderLineOptionResponse(
    string? GroupNameZh,
    string? GroupNameIt,
    string? GroupNameEn,
    string? NameZh,
    string? NameIt,
    string? NameEn,
    long PriceDeltaCents
)
{
    public static OrderLineOptionResponse[] ForLine(OrderItem item) =>
        item
            .OptionsSnapshot.Select(x => new OrderLineOptionResponse(
                x.GroupNameZh,
                x.GroupNameIt,
                x.GroupNameEn,
                x.NameZh,
                x.NameIt,
                x.NameEn,
                x.PriceDeltaCents
            ))
            .ToArray();
}

public sealed record OrderLineResponse(
    Guid Id,
    Guid? MenuItemId,
    string? ItemCode,
    string? NameZh,
    string? NameIt,
    string? NameEn,
    string[] AllergenCodes,
    long UnitPriceCents,
    int Quantity,
    string? Remark,
    OrderLineOptionResponse[] Options,
    string Status,
    DateTime? ReadyAt,
    DateTime? CancelledAt
)
{
    public static OrderLineResponse[] ForOrder(Order order) =>
        order
            .Items.OrderBy(x => x.Id)
            .Select(x => new OrderLineResponse(
                x.Id,
                x.MenuItemId,
                x.ItemCodeSnapshot,
                x.NameZhSnapshot,
                x.NameItSnapshot,
                x.NameEnSnapshot,
                x.AllergenCodesSnapshot,
                x.UnitPriceCents,
                x.Quantity,
                x.Remark,
                OrderLineOptionResponse.ForLine(x),
                ApiEnum.Text(x.Status),
                x.ReadyAt,
                x.CancelledAt
            ))
            .ToArray();
}

public sealed record OrderResponse(
    Guid Id,
    Guid SessionId,
    string Status,
    DateTime CreatedAt,
    string DefaultLanguage,
    long TotalAmountCents,
    long PayableAmountCents,
    OrderLineResponse[] Items
)
{
    public static OrderResponse From(Order order) =>
        new(
            order.Id,
            order.DiningSessionId,
            ApiEnum.Text(order.Status),
            order.CreatedAt,
            order.DefaultLanguageSnapshot,
            order.TotalAmountCents,
            Payable(order),
            OrderLineResponse.ForOrder(order)
        );

    public static long Payable(Order order) =>
        order
            .Items.Where(i => i.Status != OrderItemStatus.Cancelled)
            .Sum(i => checked(i.UnitPriceCents * i.Quantity));
}

public sealed record OrderPage(OrderResponse[] Items, string? NextCursor, long TotalAmountCents);

public sealed record OrderCreation(OrderResponse Order, bool Created);

public sealed record MenuChange(
    Guid MenuItemId,
    string Reason,
    long? CurrentUnitPriceCents,
    bool? IsAvailable
);

public static class OrderErrors
{
    public static ApiException Invalid(string field, string message) =>
        ApiException.Validation("Check the order.", field, message);

    public static ApiException MenuChanged(MenuChange[] changes) =>
        new(409, "MENU_CHANGED", "Dish details have changed. Check the menu and amounts again.")
        {
            Extensions = new() { ["changes"] = changes },
        };
}
