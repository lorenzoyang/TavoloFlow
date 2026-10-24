using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Platform;

public sealed class UnknownPlatformPassword
{
    public PlatformUser User { get; } = new() { Username = "unknown", PasswordHash = "" };
    public UnknownPlatformPassword(IPasswordHasher<PlatformUser> hasher) =>
        User.PasswordHash = hasher.HashPassword(User, Guid.NewGuid().ToString("N"));
}

public sealed class PlatformAccountService(ApplicationDbContext db, IPasswordHasher<PlatformUser> hasher,
    UnknownPlatformPassword unknown, ILogger<PlatformAccountService> logger)
{
    public async Task<PlatformUser?> AuthenticateAsync(string username, string password, CancellationToken ct)
    {
        var normalized = AccountInput.NormalizeUsername(username);
        var user = await db.PlatformUsers.AsNoTracking().SingleOrDefaultAsync(u => u.Username == normalized, ct);
        var candidate = user ?? unknown.User;
        var valid = hasher.VerifyHashedPassword(candidate, candidate.PasswordHash, password) != PasswordVerificationResult.Failed;
        return valid && user is { IsActive: true } ? user : null;
    }

    public async Task<PasswordChangeResult> ChangePasswordAsync(PlatformUser user, string password, string next, CancellationToken ct)
    {
        if (hasher.VerifyHashedPassword(user, user.PasswordHash, password) == PasswordVerificationResult.Failed)
            return PasswordChangeResult.IncorrectPassword;
        if (hasher.VerifyHashedPassword(user, user.PasswordHash, next) != PasswordVerificationResult.Failed)
            return PasswordChangeResult.SamePassword;
        var hash = hasher.HashPassword(user, next);
        var count = await db.PlatformUsers.Where(u => u.Id == user.Id && u.IsActive && u.CredentialVersion == user.CredentialVersion)
            .ExecuteUpdateAsync(u => u.SetProperty(x => x.PasswordHash, hash)
                .SetProperty(x => x.CredentialVersion, x => x.CredentialVersion + 1), ct);
        if (count != 1) return PasswordChangeResult.CredentialsChanged;
        user.PasswordHash = hash;
        user.CredentialVersion++;
        logger.LogInformation("Platform password changed for {AccountId}.", user.Id);
        return PasswordChangeResult.Changed;
    }
}

public sealed class PlatformBootstrapOptions
{
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
}

public sealed class PlatformBootstrap(ApplicationDbContext db, IPasswordHasher<PlatformUser> hasher,
    ILogger<PlatformBootstrap> logger)
{
    public async Task<bool> RunAsync(PlatformBootstrapOptions options, bool reset, CancellationToken ct = default)
    {
        var username = AccountInput.NormalizeUsername(options.Username);
        if (username.Length is < 1 or > 50 || !AccountInput.IsValidPassword(options.Password))
            throw new InvalidOperationException("Configure PlatformBootstrap username (1–50) and password (6–128 nonblank characters).");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(726186210008)", ct);
        var users = await db.PlatformUsers.FromSql($"SELECT * FROM platform_users FOR UPDATE").ToListAsync(ct);
        if (reset)
        {
            var user = users.SingleOrDefault(u => u.Username == username)
                ?? throw new InvalidOperationException("The named platform account does not exist; no credentials changed.");
            user.PasswordHash = hasher.HashPassword(user, options.Password);
            user.CredentialVersion = checked(user.CredentialVersion + 1);
            // Password recovery does not silently reactivate a disabled account.
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            logger.LogInformation("Platform credentials recovered for {AccountId}.", user.Id);
            return true;
        }
        if (users.Count != 0)
        {
            if (users.Count != 1 || users[0].Username != username)
                throw new InvalidOperationException("Platform bootstrap conflicts with existing accounts; nothing changed.");
            await transaction.CommitAsync(ct);
            return false;
        }
        var created = new PlatformUser { Username = username, PasswordHash = "" };
        created.PasswordHash = hasher.HashPassword(created, options.Password);
        db.PlatformUsers.Add(created);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        logger.LogInformation("Platform administrator initialized: {AccountId}.", created.Id);
        return true;
    }
}
