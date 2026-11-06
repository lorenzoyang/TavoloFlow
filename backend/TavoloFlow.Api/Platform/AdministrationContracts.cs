using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Platform;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CreateRestaurantInput(
    Guid Id,
    [Required, StringLength(InputRules.MaxRestaurantNameLength)] string Name,
    // Checked against InputRules.Languages by RestaurantAdministration.CreateAsync.
    [Required] string DefaultLanguage,
    [Required, StringLength(AccountInput.MaxUsernameLength)] string OwnerUsername,
    [Required, StringLength(AccountInput.MaxUsernameLength)] string StaffUsername,
    [StringLength(500)] string? OwnerContact = null,
    long? DefaultAnnualFeeCents = null,
    InitialSubscriptionPeriod? InitialPeriod = null,
    [StringLength(2048)] string? GoogleMapsUrl = null,
    bool JoinCodeRequired = true,
    string Theme = "TERRACOTTA"
);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ServiceStatusInput(
    [Required, RegularExpression("^(ACTIVE|SUSPENDED)$")] string Status
);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record GoogleMapsUrlInput([StringLength(2048)] string? GoogleMapsUrl);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record JoinCodeRequiredInput([Required] bool? JoinCodeRequired);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ThemeInput([Required] string? Theme);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ResetAccountInput(
    [Required, Range(1, int.MaxValue - 1)] int? ExpectedCredentialVersion
);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record AccountActiveInput(
    [Required] bool? IsActive,
    [Required, Range(1, int.MaxValue - 1)] int? ExpectedCredentialVersion
);

public sealed record ManagedAccount(
    Guid Id,
    string Username,
    string Role,
    bool IsActive,
    bool MustChangePassword,
    int CredentialVersion
)
{
    public static ManagedAccount From(RestaurantUser user) =>
        new(
            user.Id,
            user.Username,
            ApiEnum.Text(user.Role),
            user.IsActive,
            user.MustChangePassword,
            user.CredentialVersion
        );
}

// Platform-only: store and guest responses never carry the map link.
public sealed record RestaurantSummary(
    Guid Id,
    string Name,
    string DefaultLanguage,
    string TimeZone,
    string CurrencyCode,
    string ServiceStatus,
    bool OrderingEnabled,
    DateTime CreatedAt,
    string? GoogleMapsUrl,
    bool JoinCodeRequired,
    string Theme,
    SubscriptionSummary? Subscription = null
)
{
    public static RestaurantSummary From(Restaurant restaurant) =>
        new(
            restaurant.Id,
            restaurant.Name,
            restaurant.DefaultLanguage,
            restaurant.TimeZone,
            restaurant.CurrencyCode,
            ApiEnum.Text(restaurant.ServiceStatus),
            restaurant.OrderingEnabled,
            restaurant.CreatedAt,
            restaurant.GoogleMapsUrl,
            restaurant.JoinCodeRequired,
            ApiEnum.Text(restaurant.Theme)
        );
}

public sealed record RestaurantDetail(RestaurantSummary Restaurant, ManagedAccount[] Accounts);

public sealed record RestaurantPage(
    RestaurantSummary[] Items,
    int TotalCount,
    int Page,
    int PageSize
);

public sealed record TemporaryAccount(ManagedAccount Account, string TemporaryPassword);

public sealed record CreatedRestaurant(
    RestaurantSummary Restaurant,
    TemporaryAccount[] Credentials
);

public static class AdministrationErrors
{
    public static ApiException RestaurantNotFound() =>
        new(404, "RESTAURANT_NOT_FOUND", "The restaurant doesn't exist.");

    public static ApiException NotSuspended() =>
        new(
            409,
            "RESTAURANT_NOT_SUSPENDED",
            "Suspend the restaurant's service first, then delete it."
        );

    public static ApiException AccountNotFound() =>
        new(
            404,
            "ACCOUNT_NOT_FOUND",
            "The account doesn't exist or doesn't belong to this restaurant."
        );

    public static ApiException InvalidTheme() =>
        ApiException.Validation("Choose a valid theme.", "theme", "Unknown theme.");

    public static ApiException AccountChanged() =>
        new(409, "ACCOUNT_CHANGED", "The account has changed. Reload and check again.");
}
