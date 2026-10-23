using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Platform;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CreateRestaurantInput(Guid Id, [Required, StringLength(150)] string Name,
    [Required, RegularExpression("^(zh|it|en)$")] string DefaultLanguage,
    [Required, StringLength(50)] string OwnerUsername, [Required, StringLength(50)] string StaffUsername);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ServiceStatusInput([Required, RegularExpression("^(ACTIVE|SUSPENDED)$")] string Status);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ResetAccountInput([Required, Range(1, int.MaxValue - 1)] int? ExpectedCredentialVersion);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record AccountActiveInput([Required] bool? IsActive,
    [Required, Range(1, int.MaxValue - 1)] int? ExpectedCredentialVersion);

public sealed record ManagedAccount(Guid Id, string Username, string Role, bool IsActive,
    bool MustChangePassword, int CredentialVersion)
{
    public static ManagedAccount From(RestaurantUser user) => new(user.Id, user.Username,
        user.Role.ToString().ToUpperInvariant(), user.IsActive, user.MustChangePassword, user.CredentialVersion);
}
public sealed record RestaurantSummary(Guid Id, string Name, string DefaultLanguage, string TimeZone,
    string CurrencyCode, string ServiceStatus, bool OrderingEnabled, DateTime CreatedAt)
{
    public static RestaurantSummary From(Restaurant restaurant) => new(restaurant.Id, restaurant.Name,
        restaurant.DefaultLanguage, restaurant.TimeZone, restaurant.CurrencyCode,
        restaurant.ServiceStatus.ToString().ToUpperInvariant(), restaurant.OrderingEnabled, restaurant.CreatedAt);
}
public sealed record RestaurantDetail(RestaurantSummary Restaurant, ManagedAccount[] Accounts);
public sealed record RestaurantPage(RestaurantSummary[] Items, int TotalCount, int Page, int PageSize);
public sealed record TemporaryAccount(ManagedAccount Account, string TemporaryPassword);
public sealed record CreatedRestaurant(RestaurantSummary Restaurant, TemporaryAccount[] Credentials);

public sealed class AdministrationException(int status, string code, string message) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public static AdministrationException Missing() => new(404, "ACCOUNT_NOT_FOUND", "账号不存在或不属于此餐厅。");
    public static AdministrationException Changed() => new(409, "ACCOUNT_CHANGED", "目标账号已变化，请重新读取并确认。");
}
public sealed class AdministrationErrorsAttribute : ExceptionFilterAttribute
{
    public override void OnException(ExceptionContext context)
    {
        if (context.Exception is not AdministrationException error) return;
        context.Result = new ObjectResult(ApiError.Create(context.HttpContext, error.Code, error.Message)) { StatusCode = error.Status };
        context.ExceptionHandled = true;
    }
}
