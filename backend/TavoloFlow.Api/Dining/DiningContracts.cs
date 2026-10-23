using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using TavoloFlow.Api.Accounts;

namespace TavoloFlow.Api.Dining;

public sealed record ActiveSessionResponse(Guid Id, DateTime OpenedAt);
public sealed record FloorTableResponse(Guid Id, string TableLabel, bool IsEnabled, ActiveSessionResponse? Session);
public sealed record FloorResponse(string ServiceStatus, bool OrderingEnabled, FloorTableResponse[] Tables);
public sealed record SessionResponse(Guid Id, Guid? TableId, string TableLabel, string Status, DateTime OpenedAt,
    DateTime? ClosedAt, string? CloseReason, int BillVersion, int OrderCount, long TotalAmountCents);
public sealed record OpenSessionResponse(SessionResponse Session, string JoinCode);
public sealed record JoinCodeResponse(Guid SessionId, string JoinCode);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record AcceptingOrdersInput([Required] bool? Enabled);
public sealed record AcceptingOrdersResponse(bool OrderingEnabled);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CloseEmptyInput([Required, Range(1, int.MaxValue)] int? ExpectedBillVersion,
    [Required] long? ConfirmedTotalCents, [Required] bool? GuestsLeftConfirmed);

public sealed class DiningException(int status, string code, string message) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public static DiningException Missing() => new(404, "SESSION_NOT_FOUND", "用餐记录不存在。");
    public static DiningException Closed() => new(409, "SESSION_CLOSED", "本次用餐已结束。");
}

public sealed class DiningErrorsAttribute : ExceptionFilterAttribute
{
    public override void OnException(ExceptionContext context)
    {
        if (context.Exception is not DiningException error) return;
        context.Result = new ObjectResult(ApiError.Create(context.HttpContext, error.Code, error.Message))
        { StatusCode = error.Status };
        context.ExceptionHandled = true;
    }
}
