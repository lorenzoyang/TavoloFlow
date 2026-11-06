using System.Globalization;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace TavoloFlow.Api.Common;

// The single JSON error body every endpoint returns:
// { code, message, requestId, errors, ...extensions }.
public sealed record ApiError(
    string Code,
    string Message,
    string RequestId,
    IReadOnlyDictionary<string, string[]>? Errors = null
)
{
    // Extra top-level members of specific codes, such as MENU_CHANGED "changes" and BILL_CHANGED "currentBill".
    // Extension keys are written verbatim, so they must already be camelCase.
    [JsonExtensionData]
    public Dictionary<string, object?>? Extensions { get; init; }

    public static ApiError Create(
        HttpContext context,
        string code,
        string message,
        IReadOnlyDictionary<string, string[]>? errors = null
    ) => new(code, message, context.TraceIdentifier, errors);

    // Authentication events respond before MVC filters run, so they write the body directly.
    public static Task WriteAsync(HttpContext context, int status, string code, string message)
    {
        context.Response.StatusCode = status;
        return context.Response.WriteAsJsonAsync(Create(context, code, message));
    }
}

// An expected business rejection. Services throw it;
// ApiExceptionFilter turns it into an ApiError response,
// so controllers never need to know which errors a service path can raise.
public sealed class ApiException(
    int status,
    string code,
    string message,
    IReadOnlyDictionary<string, string[]>? errors = null
) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public IReadOnlyDictionary<string, string[]>? Errors { get; } = errors;
    public Dictionary<string, object?>? Extensions { get; init; }
    public int? RetryAfterSeconds { get; init; }

    public static ApiException Validation(
        string message,
        IReadOnlyDictionary<string, string[]>? errors = null
    ) => new(400, "VALIDATION_FAILED", message, errors);

    public static ApiException Validation(string message, string field, string detail) =>
        Validation(message, new Dictionary<string, string[]> { [field] = [detail] });

    public static ApiException RateLimited(int seconds, string message) =>
        new(429, "RATE_LIMITED", message) { RetryAfterSeconds = seconds };
}

// Registered globally in Program.cs: every controller maps ApiException the same way.
public sealed class ApiExceptionFilter : IExceptionFilter
{
    public void OnException(ExceptionContext context)
    {
        if (context.Exception is not ApiException error)
        {
            return;
        }
        if (error.RetryAfterSeconds is { } seconds)
        {
            context.HttpContext.Response.Headers.RetryAfter = seconds.ToString(
                CultureInfo.InvariantCulture
            );
        }
        var body = ApiError.Create(
            context.HttpContext,
            error.Code,
            error.Message,
            error.Errors
        ) with
        {
            Extensions = error.Extensions,
        };
        context.Result = new ObjectResult(body) { StatusCode = error.Status };
        context.ExceptionHandled = true;
    }

    // [ApiController] model-binding failures use the same envelope (see Program.cs).
    public static IActionResult InvalidModelState(ActionContext context)
    {
        var errors = context
            .ModelState.Where(entry => entry.Value?.Errors.Count > 0)
            .ToDictionary(
                entry => entry.Key,
                entry => entry.Value!.Errors.Select(_ => "请检查字段格式和长度。").ToArray()
            );

        return new BadRequestObjectResult(
            ApiError.Create(context.HttpContext, "VALIDATION_FAILED", "请检查输入内容。", errors)
        );
    }
}
