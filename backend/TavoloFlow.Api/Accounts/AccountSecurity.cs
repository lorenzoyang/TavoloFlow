using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace TavoloFlow.Api.Accounts;

// Even anonymous login tokens belong to one browser identity domain.
public sealed class BrowserCsrfScope : IAntiforgeryAdditionalDataProvider
{
    public string GetAdditionalData(HttpContext context) =>
        context.Request.Path.StartsWithSegments("/api/platform") ? "platform" :
        context.Request.Path.StartsWithSegments("/api/public") ? "guest" : "store";
    public bool ValidateAdditionalData(HttpContext context, string additionalData) =>
        additionalData == GetAdditionalData(context);
}

public sealed class PasswordChangedRequirement : IAuthorizationRequirement;

public sealed class PasswordChangedHandler : AuthorizationHandler<PasswordChangedRequirement>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context, PasswordChangedRequirement requirement)
    {
        if (context.User.FindFirst(StoreAuthentication.PasswordChangeClaim)?.Value == "false")
        {
            context.Succeed(requirement);
        }
        return Task.CompletedTask;
    }
}

public sealed class AccountAuthorizationResultHandler : IAuthorizationMiddlewareResultHandler
{
    private readonly AuthorizationMiddlewareResultHandler defaultHandler = new();

    public Task HandleAsync(RequestDelegate next, HttpContext context, AuthorizationPolicy policy,
        PolicyAuthorizationResult result)
    {
        if (result.Forbidden &&
            result.AuthorizationFailure?.FailedRequirements.OfType<PasswordChangedRequirement>().Any() == true)
        {
            return StoreCookieEvents.WriteErrorAsync(context, StatusCodes.Status403Forbidden,
                "PASSWORD_CHANGE_REQUIRED", "请先修改初始密码。");
        }
        return defaultHandler.HandleAsync(next, context, policy, result);
    }
}

// AddControllers does not automatically validate antiforgery tokens for JSON requests.
public sealed class CsrfValidationFilter(IAntiforgery antiforgery) : IAsyncAuthorizationFilter
{
    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var method = context.HttpContext.Request.Method;
        if (HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method))
        {
            return;
        }
        try
        {
            await antiforgery.ValidateRequestAsync(context.HttpContext);
        }
        catch (AntiforgeryValidationException)
        {
            context.Result = new BadRequestObjectResult(ApiError.Create(context.HttpContext,
                "CSRF_VALIDATION_FAILED", "页面验证已失效，请刷新后重试。"));
        }
    }
}
