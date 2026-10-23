using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using TavoloFlow.Api.Kitchen;

namespace TavoloFlow.Api.Billing;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CheckoutInput([Required, Range(1, int.MaxValue)] int? ExpectedBillVersion,
    [Required] long? ConfirmedTotalCents);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CloseVoidInput([Required, Range(1, int.MaxValue)] int? ExpectedBillVersion,
    [Required] long? ConfirmedTotalCents, [Required] bool? GuestsLeftConfirmed);

public sealed record BillSummaryResponse(Guid SessionId, Guid? TableId, string TableLabel, string Status,
    DateTime OpenedAt, DateTime? ClosedAt, string? CloseReason, int BillVersion, int OrderCount,
    int NewOrderCount, int CancelledOrderCount, long TotalAmountCents);
public sealed record BillPage(BillSummaryResponse Summary, KitchenOrderResponse[] Orders, string? NextCursor);
public sealed record HistoryPage(BillSummaryResponse[] Items, string? NextCursor, long TotalCount,
    DateOnly FromDate, DateOnly ToDate, string TimeZone);

public sealed class BillingException(int status, string code, string message,
    BillSummaryResponse? currentBill = null) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public BillSummaryResponse? CurrentBill { get; } = currentBill;
    public static BillingException Invalid(string message) => new(400, "VALIDATION_FAILED", message);
    public static BillingException Changed(BillSummaryResponse bill) =>
        new(409, "BILL_CHANGED", "账单已变化，请重新核对桌号、金额和订单。", bill);
}

public sealed class BillingErrorsAttribute : ExceptionFilterAttribute
{
    public override void OnException(ExceptionContext context)
    {
        if (context.Exception is not BillingException error) return;
        context.Result = new ObjectResult(new { error.Code, error.Message,
            RequestId = context.HttpContext.TraceIdentifier, error.CurrentBill }) { StatusCode = error.Status };
        context.ExceptionHandled = true;
    }
}
