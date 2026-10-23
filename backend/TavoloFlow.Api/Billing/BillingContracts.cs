using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using TavoloFlow.Api.Common;
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

public static class BillingErrors
{
    // Closure conflicts include the latest bill, so the owner can re-check it before confirming again.
    public static ApiException Conflict(string code, string message, BillSummaryResponse bill) =>
        new(409, code, message) { Extensions = new() { ["currentBill"] = bill } };

    public static ApiException Changed(BillSummaryResponse bill) =>
        Conflict("BILL_CHANGED", "账单已变化，请重新核对桌号、金额和订单。", bill);
}
