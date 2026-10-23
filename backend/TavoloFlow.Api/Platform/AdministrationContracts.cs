using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using TavoloFlow.Api.Common;
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
        ApiEnum.Text(user.Role), user.IsActive, user.MustChangePassword, user.CredentialVersion);
}
public sealed record RestaurantSummary(Guid Id, string Name, string DefaultLanguage, string TimeZone,
    string CurrencyCode, string ServiceStatus, bool OrderingEnabled, DateTime CreatedAt)
{
    public static RestaurantSummary From(Restaurant restaurant) => new(restaurant.Id, restaurant.Name,
        restaurant.DefaultLanguage, restaurant.TimeZone, restaurant.CurrencyCode,
        ApiEnum.Text(restaurant.ServiceStatus), restaurant.OrderingEnabled, restaurant.CreatedAt);
}
public sealed record RestaurantDetail(RestaurantSummary Restaurant, ManagedAccount[] Accounts);
public sealed record RestaurantPage(RestaurantSummary[] Items, int TotalCount, int Page, int PageSize);
public sealed record TemporaryAccount(ManagedAccount Account, string TemporaryPassword);
public sealed record CreatedRestaurant(RestaurantSummary Restaurant, TemporaryAccount[] Credentials);

public static class AdministrationErrors
{
    public static ApiException RestaurantNotFound() => new(404, "RESTAURANT_NOT_FOUND", "餐厅不存在。");
    public static ApiException AccountNotFound() => new(404, "ACCOUNT_NOT_FOUND", "账号不存在或不属于此餐厅。");
    public static ApiException AccountChanged() => new(409, "ACCOUNT_CHANGED", "目标账号已变化，请重新读取并确认。");
}
