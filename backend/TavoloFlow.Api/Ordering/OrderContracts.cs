using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Ordering;

// Only the envelope is validated before recovery. A persisted request takes precedence over its resent contents.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CreateOrderInput([Required] Guid? SessionId, [Required] Guid? ClientRequestId,
    OrderLineInput?[]? Items, string? OrderNote);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record OrderLineInput(Guid MenuItemId, int Quantity, long ExpectedUnitPriceCents, string? Remark);

public sealed record OrderLineResponse(Guid Id, Guid? MenuItemId, string? ItemCode,
    string? NameZh, string? NameIt, string? NameEn, string[] AllergenCodes, long UnitPriceCents, int Quantity, string? Remark)
{
    public static OrderLineResponse[] ForOrder(Order order) => order.Items.OrderBy(x => x.Id).Select(x => new OrderLineResponse(
        x.Id, x.MenuItemId, x.ItemCodeSnapshot, x.NameZhSnapshot, x.NameItSnapshot, x.NameEnSnapshot,
        x.AllergenCodesSnapshot, x.UnitPriceCents, x.Quantity, x.Remark)).ToArray();
}

public sealed record OrderResponse(Guid Id, Guid SessionId, string Status, DateTime CreatedAt,
    string DefaultLanguage, long TotalAmountCents, string? OrderNote, OrderLineResponse[] Items)
{
    public static OrderResponse From(Order order) => new(order.Id, order.DiningSessionId, ApiEnum.Text(order.Status),
        order.CreatedAt, order.DefaultLanguageSnapshot, order.TotalAmountCents, order.OrderNote,
        OrderLineResponse.ForOrder(order));
}

public sealed record OrderPage(OrderResponse[] Items, string? NextCursor, long TotalAmountCents);
public sealed record OrderCreation(OrderResponse Order, bool Created);
public sealed record MenuChange(Guid MenuItemId, string Reason, long? CurrentUnitPriceCents, bool? IsAvailable);

public static class OrderErrors
{
    public static ApiException Invalid(string field, string message) =>
        ApiException.Validation("请检查订单内容。", field, message);

    public static ApiException MenuChanged(MenuChange[] changes) =>
        new(409, "MENU_CHANGED", "菜品信息已变化，请重新核对菜单和金额。") { Extensions = new() { ["changes"] = changes } };
}
