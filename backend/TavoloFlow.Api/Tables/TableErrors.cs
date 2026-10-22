using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using TavoloFlow.Api.Accounts;

namespace TavoloFlow.Api.Tables;

public sealed class TableException(int status, string code, string message,
    IReadOnlyDictionary<string, string[]>? errors = null) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public IReadOnlyDictionary<string, string[]>? Errors { get; } = errors;
    public static TableException NotFound() => new(404, "TABLE_NOT_FOUND", "桌位不存在，请刷新列表。");
    public static TableException LabelConflict() => new(409, "TABLE_LABEL_CONFLICT", "本店已有相同桌号。",
        new Dictionary<string, string[]> { ["tableLabel"] = ["请使用不同的桌号。"] });
}

public sealed class TableErrorsAttribute : ExceptionFilterAttribute
{
    public override void OnException(ExceptionContext context)
    {
        if (context.Exception is not TableException error) return;
        context.Result = new ObjectResult(ApiError.Create(context.HttpContext, error.Code, error.Message, error.Errors))
        { StatusCode = error.Status };
        context.ExceptionHandled = true;
    }
}
