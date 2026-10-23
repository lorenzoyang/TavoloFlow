using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Ordering;

// Only the envelope is validated before recovery. A persisted request takes precedence over its resent contents.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CreateOrderInput([Required] Guid? SessionId, [Required] Guid? ClientRequestId,
    OrderLineInput?[]? Items, string? OrderNote);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record OrderLineInput(Guid MenuItemId, int Quantity, long ExpectedUnitPriceCents, string? Remark);

public sealed record OrderLineResponse(Guid Id, Guid? MenuItemId, string? ItemCode,
    string? NameZh, string? NameIt, string? NameEn, string[] AllergenCodes, long UnitPriceCents, int Quantity, string? Remark);

public sealed record OrderResponse(Guid Id, Guid SessionId, string Status, DateTime CreatedAt,
    string DefaultLanguage, long TotalAmountCents, string? OrderNote, OrderLineResponse[] Items)
{
    public static OrderResponse From(Order order) => new(order.Id, order.DiningSessionId,
        order.Status.ToString().ToUpperInvariant(), order.CreatedAt, order.DefaultLanguageSnapshot,
        order.TotalAmountCents, order.OrderNote, order.Items.OrderBy(x => x.Id).Select(x => new OrderLineResponse(
            x.Id, x.MenuItemId, x.ItemCodeSnapshot, x.NameZhSnapshot, x.NameItSnapshot, x.NameEnSnapshot,
            x.AllergenCodesSnapshot, x.UnitPriceCents, x.Quantity, x.Remark)).ToArray());
}

public sealed record OrderPage(OrderResponse[] Items, string? NextCursor, long TotalAmountCents);
public sealed record OrderCreation(OrderResponse Order, bool Created);
public sealed record MenuChange(Guid MenuItemId, string Reason, long? CurrentUnitPriceCents, bool? IsAvailable);

public sealed class OrderException(int status, string code, string message,
    IReadOnlyDictionary<string, string[]>? errors = null, MenuChange[]? changes = null) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public IReadOnlyDictionary<string, string[]>? Errors { get; } = errors;
    public MenuChange[]? Changes { get; } = changes;
    public static OrderException Invalid(string field, string message) => new(400, "VALIDATION_FAILED",
        "请检查订单内容。", new Dictionary<string, string[]> { [field] = [message] });
}

public sealed class OrderErrorsAttribute : ExceptionFilterAttribute
{
    public override void OnException(ExceptionContext context)
    {
        if (context.Exception is not OrderException error) return;
        context.Result = new ObjectResult(new { error.Code, error.Message,
            RequestId = context.HttpContext.TraceIdentifier, error.Errors, error.Changes }) { StatusCode = error.Status };
        context.ExceptionHandled = true;
    }
}
