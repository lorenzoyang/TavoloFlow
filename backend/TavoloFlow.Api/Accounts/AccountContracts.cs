using System.ComponentModel.DataAnnotations;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Accounts;

public sealed record LoginRequest(
    [Required, StringLength(50)] string Username,
    [Required, StringLength(128)] string Password);

public sealed record ChangePasswordRequest(
    [Required, StringLength(128)] string CurrentPassword,
    [Required, StringLength(128, MinimumLength = 12)] string NewPassword);

public sealed record CurrentAccountResponse(
    Guid UserId,
    string Username,
    string Role,
    Guid RestaurantId,
    string RestaurantName,
    bool MustChangePassword)
{
    public static CurrentAccountResponse From(RestaurantUser user) => new(
        user.Id, user.Username, user.Role.ToString().ToUpperInvariant(),
        user.RestaurantId, user.Restaurant.Name, user.MustChangePassword);
}

public static class AccountInput
{
    public static string NormalizeUsername(string username) => username.Trim().ToLowerInvariant();

    public static bool IsValidPassword(string password) =>
        password.Length is >= 12 and <= 128 && !string.IsNullOrWhiteSpace(password);
}

public sealed record ApiError(
    string Code,
    string Message,
    string RequestId,
    IReadOnlyDictionary<string, string[]>? Errors = null)
{
    public static ApiError Create(HttpContext context, string code, string message,
        IReadOnlyDictionary<string, string[]>? errors = null) =>
        new(code, message, context.TraceIdentifier, errors);
}

// Populated only after the cookie has been checked against the database.
public sealed class CurrentAccount
{
    public RestaurantUser? User { get; internal set; }

    public RestaurantUser RequireUser() =>
        User ?? throw new InvalidOperationException("An authenticated restaurant account is required.");
}
