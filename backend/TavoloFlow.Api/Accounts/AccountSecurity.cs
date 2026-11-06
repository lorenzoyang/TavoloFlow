using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;
using TavoloFlow.Api.Common;

namespace TavoloFlow.Api.Accounts;

public sealed class PasswordChangedRequirement : IAuthorizationRequirement;

public sealed class PasswordChangedHandler : AuthorizationHandler<PasswordChangedRequirement>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        PasswordChangedRequirement requirement
    )
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

    public Task HandleAsync(
        RequestDelegate next,
        HttpContext context,
        AuthorizationPolicy policy,
        PolicyAuthorizationResult result
    )
    {
        if (
            result.Forbidden
            && result
                .AuthorizationFailure?.FailedRequirements.OfType<PasswordChangedRequirement>()
                .Any() == true
        )
        {
            return ApiError.WriteAsync(
                context,
                StatusCodes.Status403Forbidden,
                "PASSWORD_CHANGE_REQUIRED",
                "Change the initial password first."
            );
        }

        return defaultHandler.HandleAsync(next, context, policy, result);
    }
}
