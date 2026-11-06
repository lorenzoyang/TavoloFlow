using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Platform;
using static TavoloFlow.Api.Tests.AccountTestHost;

namespace TavoloFlow.Api.Tests;

public sealed class PlatformAccountTests(PostgreSqlFixture database)
    : IClassFixture<PostgreSqlFixture>
{
    internal const string Password = "Platform-initial-12345";
    internal const string NewPassword = "Platform-changed-67890";

    internal static async Task<PlatformUser> SeedAsync(PostgreSqlFixture database)
    {
        await using var db = database.CreateContext();
        var user = new PlatformUser
        {
            Username = $"platform.{Guid.NewGuid():N}",
            PasswordHash = "",
        };
        user.PasswordHash = new PasswordHasher<PlatformUser>().HashPassword(user, Password);
        db.PlatformUsers.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    internal static async Task<HttpResponseMessage> WriteAsync(
        HttpClient browser,
        string path,
        object body,
        HttpMethod? method = null,
        string csrfPath = "/api/platform/auth/csrf"
    )
    {
        var token = (await browser.GetFromJsonAsync<Token>(csrfPath))!.TokenValue;
        using var request = new HttpRequestMessage(method ?? HttpMethod.Post, path)
        {
            Content = JsonContent.Create(body),
        };
        request.Headers.Add("X-CSRF-TOKEN", token);
        return await browser.SendAsync(request);
    }

    internal static Task<HttpResponseMessage> LoginAsync(HttpClient browser, PlatformUser user) =>
        WriteAsync(
            browser,
            "/api/platform/auth/login",
            new { username = user.Username, password = Password }
        );

    private sealed record Token(
        [property: System.Text.Json.Serialization.JsonPropertyName("token")] string TokenValue
    );

    [Fact]
    public async Task Bootstrap_RepeatConflictAndRecovery_PreservesThenRevokesCredentials()
    {
        await using var db = await database.CreateIsolatedContextAsync();
        await db.Database.MigrateAsync();
        var service = new PlatformBootstrap(
            db,
            new PasswordHasher<PlatformUser>(),
            NullLogger<PlatformBootstrap>.Instance
        );
        var options = new PlatformBootstrapOptions { Username = "  ADMIN  ", Password = Password };
        Assert.True(await service.RunAsync(options, false));
        var original = await db.PlatformUsers.AsNoTracking().SingleAsync();
        options.Password = NewPassword;
        Assert.False(await service.RunAsync(options, false));
        Assert.Equal(
            original.PasswordHash,
            (await db.PlatformUsers.AsNoTracking().SingleAsync()).PasswordHash
        );
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.RunAsync(new() { Username = "different", Password = Password }, false)
        );
        Assert.True(await service.RunAsync(options, true));
        var reset = await db.PlatformUsers.AsNoTracking().SingleAsync();
        Assert.Equal("admin", reset.Username);
        Assert.Equal(2, reset.CredentialVersion);
        Assert.NotEqual(original.PasswordHash, reset.PasswordHash);
    }

    [Fact]
    public async Task Bootstrap_ConcurrentInitializations_CreatesOnlyOneAdministrator()
    {
        await using var first = await database.CreateIsolatedContextAsync();
        await first.Database.MigrateAsync();
        await using var second = new TavoloFlow.Api.Data.ApplicationDbContext(
            new DbContextOptionsBuilder<TavoloFlow.Api.Data.ApplicationDbContext>()
                .UseNpgsql(first.Database.GetConnectionString())
                .Options
        );
        var options = new PlatformBootstrapOptions { Username = "admin", Password = Password };
        var results = await Task.WhenAll(
            new PlatformBootstrap(
                first,
                new PasswordHasher<PlatformUser>(),
                NullLogger<PlatformBootstrap>.Instance
            ).RunAsync(options, false),
            new PlatformBootstrap(
                second,
                new PasswordHasher<PlatformUser>(),
                NullLogger<PlatformBootstrap>.Instance
            ).RunAsync(options, false)
        );
        Assert.Single(results, value => value);
        Assert.Equal(1, await first.PlatformUsers.CountAsync());
    }

    [Fact]
    public async Task Login_NormalizedIdentity_UsesIndependentFixedLifetimeCookie()
    {
        var user = await SeedAsync(database);
        using var host = new AccountTestHost(database);
        using var browser = host.Browser();
        var response = await WriteAsync(
            browser,
            "/api/platform/auth/login",
            new { username = $" {user.Username.ToUpperInvariant()} ", password = Password }
        );
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl!.NoStore);
        var cookie = response
            .Headers.GetValues("Set-Cookie")
            .Single(x => x.StartsWith("TavoloFlow.Platform="));
        Assert.Contains("path=/api/platform", cookie);
        Assert.Contains("httponly", cookie);
        Assert.Contains("secure", cookie);
        host.AssertPersistentTicket(
            response,
            PlatformAuthentication.Scheme,
            PlatformAuthentication.CookieName
        );
        var me = await browser.GetFromJsonAsync<PlatformIdentityResponse>("/api/platform/auth/me");
        Assert.Equal(user.Id, me!.UserId);
        await AssertErrorAsync(
            await browser.GetAsync("/api/test-accounts/owner"),
            HttpStatusCode.Unauthorized,
            "UNAUTHENTICATED"
        );
        await AssertErrorAsync(
            await browser.GetAsync("/api/auth/me"),
            HttpStatusCode.Unauthorized,
            "UNAUTHENTICATED"
        );
        host.Clock.Advance(TimeSpan.FromDays(29));
        var beforeExpiry = await browser.GetAsync("/api/platform/auth/me");
        Assert.Equal(HttpStatusCode.OK, beforeExpiry.StatusCode);
        Assert.False(beforeExpiry.Headers.Contains("Set-Cookie"));
        host.Clock.Advance(TimeSpan.FromDays(1) + TimeSpan.FromSeconds(1));
        await AssertErrorAsync(
            await browser.GetAsync("/api/platform/auth/me"),
            HttpStatusCode.Unauthorized,
            "UNAUTHENTICATED"
        );
    }

    [Fact]
    public async Task ChangePassword_SixDigits_ReissuesPersistentTicketAndAllowsLogin()
    {
        var user = await SeedAsync(database);
        using var host = new AccountTestHost(database);
        using var browser = host.Browser();
        await LoginAsync(browser, user);
        host.Clock.Advance(TimeSpan.FromDays(10));
        var changed = await WriteAsync(
            browser,
            "/api/platform/auth/change-password",
            new ChangePasswordRequest(Password, "123456")
        );
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        host.AssertPersistentTicket(
            changed,
            PlatformAuthentication.Scheme,
            PlatformAuthentication.CookieName
        );
        using var another = host.Browser();
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await WriteAsync(
                    another,
                    "/api/platform/auth/login",
                    new LoginRequest(user.Username, "123456")
                )
            ).StatusCode
        );
    }

    [Fact]
    public async Task ChangePassword_InvalidInputs_LeavesCredentialsUnchanged()
    {
        var user = await SeedAsync(database);
        using var host = new AccountTestHost(database);
        using var browser = host.Browser();
        await LoginAsync(browser, user);
        foreach (
            var (current, next, code) in new[]
            {
                ("incorrect", NewPassword, "CURRENT_PASSWORD_INCORRECT"),
                (Password, Password, "PASSWORD_UNCHANGED"),
                (Password, "12345", "VALIDATION_FAILED"),
                (Password, new string('x', 129), "VALIDATION_FAILED"),
                (Password, new string(' ', 6), "VALIDATION_FAILED"),
            }
        )
        {
            await AssertErrorAsync(
                await WriteAsync(
                    browser,
                    "/api/platform/auth/change-password",
                    new ChangePasswordRequest(current, next)
                ),
                HttpStatusCode.BadRequest,
                code
            );
        }
        await using var db = database.CreateContext();
        Assert.Equal(1, (await db.PlatformUsers.FindAsync(user.Id))!.CredentialVersion);
    }

    [Fact]
    public async Task Login_CrossDomainAnonymousCsrf_IsRejected()
    {
        var user = await SeedAsync(database);
        using var host = new AccountTestHost(database);
        using var browser = host.Browser();
        foreach (var source in new[] { "/api/auth/csrf", "/api/public/csrf" })
            await AssertErrorAsync(
                await WriteAsync(
                    browser,
                    "/api/platform/auth/login",
                    new { username = user.Username, password = Password },
                    csrfPath: source
                ),
                HttpStatusCode.BadRequest,
                "CSRF_VALIDATION_FAILED"
            );
        Assert.Equal(HttpStatusCode.OK, (await LoginAsync(browser, user)).StatusCode);
    }

    [Fact]
    public async Task ChangePassword_SecondBrowserAndDisabledAccount_RejectsOldCredentials()
    {
        var user = await SeedAsync(database);
        using var host = new AccountTestHost(database);
        using var first = host.Browser();
        using var second = host.Browser();
        await LoginAsync(first, user);
        await LoginAsync(second, user);
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await WriteAsync(
                    first,
                    "/api/platform/auth/change-password",
                    new { currentPassword = Password, newPassword = NewPassword }
                )
            ).StatusCode
        );
        Assert.Equal(HttpStatusCode.OK, (await first.GetAsync("/api/platform/auth/me")).StatusCode);
        await AssertErrorAsync(
            await second.GetAsync("/api/platform/auth/me"),
            HttpStatusCode.Unauthorized,
            "UNAUTHENTICATED"
        );
        await using var db = database.CreateContext();
        await db
            .PlatformUsers.Where(u => u.Id == user.Id)
            .ExecuteUpdateAsync(u => u.SetProperty(x => x.IsActive, false));
        await AssertErrorAsync(
            await first.GetAsync("/api/platform/auth/me"),
            HttpStatusCode.Unauthorized,
            "UNAUTHENTICATED"
        );
    }

    [Fact]
    public async Task Login_FailuresAndRateLimit_DoNotLeakAccountExistence()
    {
        var user = await SeedAsync(database);
        using var host = new AccountTestHost(database, lowLimits: true);
        using var browser = host.Browser();
        await AssertErrorAsync(
            await WriteAsync(
                browser,
                "/api/platform/auth/login",
                new { username = "missing", password = Password }
            ),
            HttpStatusCode.Unauthorized,
            "INVALID_CREDENTIALS"
        );
        await AssertErrorAsync(
            await WriteAsync(
                browser,
                "/api/platform/auth/login",
                new { username = user.Username, password = "wrong" }
            ),
            HttpStatusCode.Unauthorized,
            "INVALID_CREDENTIALS"
        );
        await using var db = database.CreateContext();
        await db
            .PlatformUsers.Where(u => u.Id == user.Id)
            .ExecuteUpdateAsync(u => u.SetProperty(x => x.IsActive, false));
        await AssertErrorAsync(
            await LoginAsync(browser, user),
            HttpStatusCode.Unauthorized,
            "INVALID_CREDENTIALS"
        );
        var limited = await LoginAsync(browser, user);
        await AssertErrorAsync(limited, HttpStatusCode.TooManyRequests, "RATE_LIMITED");
        Assert.NotNull(limited.Headers.RetryAfter);
    }

    [Fact]
    public async Task ChangePassword_ConcurrentSameVersion_OnlyOneSucceeds()
    {
        var user = await SeedAsync(database);
        using var host = new AccountTestHost(database);
        await using var first = host.Services.CreateAsyncScope();
        await using var second = host.Services.CreateAsyncScope();
        var a = first.ServiceProvider.GetRequiredService<PlatformAccountService>();
        var b = second.ServiceProvider.GetRequiredService<PlatformAccountService>();
        var snapshotA = (await a.AuthenticateAsync(user.Username, Password, default))!;
        var snapshotB = (await b.AuthenticateAsync(user.Username, Password, default))!;
        var results = await Task.WhenAll(
            a.ChangePasswordAsync(snapshotA, Password, NewPassword, default),
            b.ChangePasswordAsync(snapshotB, Password, "Another-safe-password", default)
        );
        Assert.Single(results, r => r == PasswordChangeResult.Changed);
        Assert.Single(results, r => r == PasswordChangeResult.CredentialsChanged);
    }
}
