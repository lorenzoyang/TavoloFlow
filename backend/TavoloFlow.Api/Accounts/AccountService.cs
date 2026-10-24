using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Accounts;

// a precomputed hash avoids a cheap username-existence timing distinction.
public sealed class UnknownAccountPassword
{
    public RestaurantUser User { get; } = new()
    {
        Username = "unknown",
        PasswordHash = "",
        Role = RestaurantUserRole.Staff
    };

    public UnknownAccountPassword(IPasswordHasher<RestaurantUser> hasher)
    {
        User.PasswordHash = hasher.HashPassword(User, Guid.NewGuid().ToString("N"));
    }
}

public sealed class AccountService(
    ApplicationDbContext context,
    IPasswordHasher<RestaurantUser> passwordHasher,
    UnknownAccountPassword unknownAccount)
{
    public async Task<RestaurantUser?> AuthenticateAsync(
        string username, string password, CancellationToken cancellationToken)
    {
        var normalized = AccountInput.NormalizeUsername(username);
        var user = await context.RestaurantUsers.AsNoTracking()
            .Include(user => user.Restaurant)
            .SingleOrDefaultAsync(user => user.Username == normalized, cancellationToken);
        var candidate = user ?? unknownAccount.User;
        var result = passwordHasher.VerifyHashedPassword(candidate, candidate.PasswordHash, password);
        return user is { IsActive: true } && result != PasswordVerificationResult.Failed ? user : null;
    }

    public async Task<PasswordChangeResult> ChangePasswordAsync(
        RestaurantUser user, string currentPassword, string newPassword, CancellationToken cancellationToken)
    {
        if (passwordHasher.VerifyHashedPassword(user, user.PasswordHash, currentPassword) ==
            PasswordVerificationResult.Failed)
        {
            return PasswordChangeResult.IncorrectPassword;
        }

        if (passwordHasher.VerifyHashedPassword(user, user.PasswordHash, newPassword) !=
            PasswordVerificationResult.Failed)
        {
            return PasswordChangeResult.SamePassword;
        }

        var newHash = passwordHasher.HashPassword(user, newPassword);
        // one atomic statement: concurrent changes cannot both overwrite the same credential version.
        var changed = await context.RestaurantUsers
            .Where(account => account.Id == user.Id && account.RestaurantId == user.RestaurantId &&
                account.Role == user.Role && account.IsActive &&
                account.CredentialVersion == user.CredentialVersion)
            .ExecuteUpdateAsync(update => update
                .SetProperty(account => account.PasswordHash, newHash)
                .SetProperty(account => account.MustChangePassword, false)
                .SetProperty(account => account.CredentialVersion, account => account.CredentialVersion + 1),
                cancellationToken);
        if (changed != 1)
        {
            return PasswordChangeResult.CredentialsChanged;
        }

        user.PasswordHash = newHash;
        user.MustChangePassword = false;
        user.CredentialVersion++;
        return PasswordChangeResult.Changed;
    }
}
