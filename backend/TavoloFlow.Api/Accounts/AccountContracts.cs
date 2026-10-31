using System.ComponentModel.DataAnnotations;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Accounts;

public sealed record LoginRequest(
    [Required, StringLength(50)] string Username,
    [Required, StringLength(128)] string Password);

public sealed record ChangePasswordRequest(
    [Required, StringLength(128)] string CurrentPassword,
    [Required, StringLength(128, MinimumLength = 6)] string NewPassword);

// The services decide which store pages exist; staff pages follow them on the next identity refresh.
public sealed record RestaurantServices(bool DineIn, bool Pickup)
{
    public static RestaurantServices From(Restaurant restaurant) => new(restaurant.DineInEnabled, restaurant.PickupEnabled);
}

public sealed record CurrentAccountResponse(
    Guid UserId,
    string Username,
    string Role,
    Guid RestaurantId,
    string RestaurantName,
    string RestaurantTheme,
    RestaurantServices Services,
    bool MustChangePassword)
{
    public static CurrentAccountResponse From(RestaurantUser user) => new(
        user.Id, user.Username, ApiEnum.Text(user.Role),
        user.RestaurantId, user.Restaurant.Name, ApiEnum.Text(user.Restaurant.Theme),
        RestaurantServices.From(user.Restaurant), user.MustChangePassword);
}

public static class AccountInput
{
    public static string NormalizeUsername(string username) => username.Trim().ToLowerInvariant();

    public static bool IsValidPassword(string password) =>
        password.Length is >= 6 and <= 128 && !string.IsNullOrWhiteSpace(password);

    public static void EnsureValidNewPassword(string password)
    {
        if (!IsValidPassword(password))
        {
            throw ApiException.Validation("新密码须为 6–128 个字符。", "newPassword", "密码不能全部为空白。");
        }
    }
}

public enum PasswordChangeResult
{
    Changed,
    IncorrectPassword,
    SamePassword,
    CredentialsChanged
}

public static class PasswordChangeResults
{
    // Store and platform accounts report the same outcomes; only the re-login hint differs.
    public static void EnsureChanged(this PasswordChangeResult result, string credentialsChangedMessage)
    {
        switch (result)
        {
            case PasswordChangeResult.IncorrectPassword:
                throw new ApiException(400, "CURRENT_PASSWORD_INCORRECT", "当前密码不正确。");
            case PasswordChangeResult.SamePassword:
                throw new ApiException(400, "PASSWORD_UNCHANGED", "新密码须与当前密码不同。");
            case PasswordChangeResult.CredentialsChanged:
                throw new ApiException(409, "CREDENTIALS_CHANGED", credentialsChangedMessage);
        }
    }
}

// Populated only after the cookie has been checked against the database.
public sealed class CurrentAccount
{
    public RestaurantUser? User { get; internal set; }

    public RestaurantUser RequireUser() =>
        User ?? throw new InvalidOperationException("An authenticated restaurant account is required.");
}
