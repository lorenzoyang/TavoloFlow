using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Entities;
using static TavoloFlow.Api.Tests.AccountTestHost;

namespace TavoloFlow.Api.Tests;

public sealed class AccountTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    private const string InitialPassword = "Initial-password-123";
    private const string NewPassword = "Changed-password-456";

    [Fact]
    public async Task Login_NormalizedUsername_ReturnsCurrentIdentityAndPersistentCookie()
    {
        var user = await SeedUserAsync();
        using var host = new AccountTestHost(database);
        using var client = host.Browser();
        await AssertErrorAsync(await client.GetAsync("/api/auth/me"), HttpStatusCode.Unauthorized, "UNAUTHENTICATED");
        var login = await LoginAsync(client, user, $"  {user.Username.ToUpperInvariant()}  ");
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.True(login.Headers.CacheControl!.NoStore);
        var cookie = AuthCookie(login);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=lax", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("secure", cookie, StringComparison.OrdinalIgnoreCase);
        host.AssertPersistentTicket(login, StoreAuthentication.Scheme, StoreAuthentication.CookieName);
        Assert.DoesNotContain("domain=", cookie, StringComparison.OrdinalIgnoreCase);
        var me = await client.GetFromJsonAsync<CurrentAccountResponse>("/api/auth/me");
        Assert.Equal(user.Id, me!.UserId);
        Assert.Equal(user.RestaurantId, me.RestaurantId);
        Assert.Equal("OWNER", me.Role);
        Assert.True(me.MustChangePassword);
        var json = await login.Content.ReadAsStringAsync();
        Assert.DoesNotContain("passwordHash", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("credentialVersion", json, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(RestaurantUserRole.Owner)]
    [InlineData(RestaurantUserRole.Staff)]
    public async Task ChangePassword_SixDigits_ReissuesPersistentTicketAndAllowsLogin(RestaurantUserRole role)
    {
        var user = await SeedUserAsync(role);
        using var host = new AccountTestHost(database);
        using var client = host.Browser();
        await LoginAsync(client, user);
        host.Clock.Advance(TimeSpan.FromDays(10));
        var changed = await PostAsync(client, "/api/auth/change-password",
            new ChangePasswordRequest(InitialPassword, "123456"));
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        host.AssertPersistentTicket(changed, StoreAuthentication.Scheme, StoreAuthentication.CookieName);
        Assert.False((await changed.Content.ReadFromJsonAsync<CurrentAccountResponse>())!.MustChangePassword);
        using var another = host.Browser();
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(another, "/api/auth/login",
            new LoginRequest(user.Username, "123456"))).StatusCode);
    }

    [Fact]
    public async Task Login_WrongUnknownOrDisabled_ReturnsSameFailure()
    {
        var user = await SeedUserAsync();
        using var host = new AccountTestHost(database);
        using var client = host.Browser();
        foreach (var request in new[]
        {
            new LoginRequest(user.Username, "wrong-password"),
            new LoginRequest("missing-user", InitialPassword)
        })
        {
            await AssertErrorAsync(await PostAsync(client, "/api/auth/login", request),
                HttpStatusCode.Unauthorized, "INVALID_CREDENTIALS");
        }
        await using var context = database.CreateContext();
        await context.RestaurantUsers.Where(item => item.Id == user.Id)
            .ExecuteUpdateAsync(update => update.SetProperty(item => item.IsActive, false));
        await AssertErrorAsync(await LoginAsync(client, user), HttpStatusCode.Unauthorized, "INVALID_CREDENTIALS");
    }

    [Fact]
    public async Task ChangePassword_FirstLogin_EnforcesPolicyAndRevokesOldTickets()
    {
        var user = await SeedUserAsync();
        using var host = new AccountTestHost(database);
        using var first = host.Browser();
        using var second = host.Browser();
        await LoginAsync(first, user);
        await LoginAsync(second, user);
        await AssertErrorAsync(await first.GetAsync("/api/test-accounts/staff"),
            HttpStatusCode.Forbidden, "PASSWORD_CHANGE_REQUIRED");
        var changed = await PostAsync(first, "/api/auth/change-password",
            new ChangePasswordRequest(InitialPassword, NewPassword));
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        Assert.False((await changed.Content.ReadFromJsonAsync<CurrentAccountResponse>())!.MustChangePassword);
        Assert.Equal(HttpStatusCode.OK, (await first.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await first.GetAsync("/api/test-accounts/owner")).StatusCode);
        await AssertErrorAsync(await second.GetAsync("/api/auth/me"), HttpStatusCode.Unauthorized, "UNAUTHENTICATED");
        await AssertErrorAsync(await LoginAsync(second, user), HttpStatusCode.Unauthorized, "INVALID_CREDENTIALS");
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(second, "/api/auth/login",
            new LoginRequest(user.Username, NewPassword))).StatusCode);
        await using var context = database.CreateContext();
        var persisted = await context.RestaurantUsers.FindAsync(user.Id);
        Assert.Equal(2, persisted!.CredentialVersion);
        Assert.NotEqual(NewPassword, persisted.PasswordHash);
    }

    [Fact]
    public async Task ChangePassword_InvalidInputs_LeavesCredentialsUnchanged()
    {
        var user = await SeedUserAsync();
        using var host = new AccountTestHost(database);
        using var client = host.Browser();
        await LoginAsync(client, user);
        foreach (var (oldPassword, newPassword, code) in new[]
        {
            ("incorrect-password", NewPassword, "CURRENT_PASSWORD_INCORRECT"),
            (InitialPassword, InitialPassword, "PASSWORD_UNCHANGED"),
            (InitialPassword, "short", "VALIDATION_FAILED"),
            (InitialPassword, new string('x', 129), "VALIDATION_FAILED"),
            (InitialPassword, new string(' ', 6), "VALIDATION_FAILED")
        })
        {
            await AssertErrorAsync(await PostAsync(client, "/api/auth/change-password",
                new ChangePasswordRequest(oldPassword, newPassword)), HttpStatusCode.BadRequest, code);
        }
        await using var context = database.CreateContext();
        var persisted = await context.RestaurantUsers.FindAsync(user.Id);
        Assert.Equal(1, persisted!.CredentialVersion);
        Assert.True(persisted.MustChangePassword);
    }

    [Fact]
    public async Task ChangePassword_ConcurrentSameVersion_OnlyOneUpdateWins()
    {
        var user = await SeedUserAsync();
        using var host = new AccountTestHost(database);
        await using var firstScope = host.Services.CreateAsyncScope();
        await using var secondScope = host.Services.CreateAsyncScope();
        var first = firstScope.ServiceProvider.GetRequiredService<AccountService>();
        var second = secondScope.ServiceProvider.GetRequiredService<AccountService>();
        // Both operations deliberately begin from the same authenticated database snapshot.
        var firstUser = (await first.AuthenticateAsync(user.Username, InitialPassword, default))!;
        var secondUser = (await second.AuthenticateAsync(user.Username, InitialPassword, default))!;
        var results = await Task.WhenAll(
            first.ChangePasswordAsync(firstUser, InitialPassword, NewPassword, default),
            second.ChangePasswordAsync(secondUser, InitialPassword, "Another-password-789", default));
        Assert.Single(results, result => result == PasswordChangeResult.Changed);
        Assert.Single(results, result => result == PasswordChangeResult.CredentialsChanged);
        await using var context = database.CreateContext();
        Assert.Equal(2, (await context.RestaurantUsers.FindAsync(user.Id))!.CredentialVersion);
    }

    [Fact]
    public async Task Logout_CurrentBrowser_DoesNotRevokeOtherBrowser()
    {
        var user = await SeedUserAsync();
        using var host = new AccountTestHost(database);
        using var first = host.Browser();
        using var second = host.Browser();
        await LoginAsync(first, user);
        await LoginAsync(second, user);
        Assert.Equal(HttpStatusCode.NoContent, (await PostAsync(first, "/api/auth/logout", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await first.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await second.GetAsync("/api/auth/me")).StatusCode);
    }

    [Theory]
    [InlineData("disabled")]
    [InlineData("version")]
    [InlineData("role")]
    [InlineData("restaurant")]
    public async Task Me_AccountChanged_RejectsExistingCookie(string change)
    {
        var user = await SeedUserAsync();
        using var host = new AccountTestHost(database);
        using var client = host.Browser();
        await LoginAsync(client, user);
        await using var context = database.CreateContext();
        var persisted = (await context.RestaurantUsers.FindAsync(user.Id))!;
        switch (change)
        {
            case "disabled": persisted.IsActive = false; break;
            case "version": persisted.CredentialVersion++; break;
            case "role": persisted.Role = RestaurantUserRole.Staff; break;
            case "restaurant":
                var other = new Restaurant { Name = "Other", DefaultLanguage = "zh" };
                context.Restaurants.Add(other);
                await context.SaveChangesAsync();
                // RestaurantId is part of an alternate key, so use SQL rather than mutating a tracked key.
                await context.RestaurantUsers.Where(item => item.Id == user.Id)
                    .ExecuteUpdateAsync(update => update.SetProperty(item => item.RestaurantId, other.Id));
                break;
        }
        if (change != "restaurant") await context.SaveChangesAsync();
        await AssertErrorAsync(await client.GetAsync("/api/auth/me"), HttpStatusCode.Unauthorized, "UNAUTHENTICATED");
    }

    [Fact]
    public async Task Me_AbsoluteExpiry_DoesNotSlideOnRequests()
    {
        var user = await SeedUserAsync();
        using var host = new AccountTestHost(database);
        using var client = host.Browser();
        await LoginAsync(client, user);
        host.Clock.Advance(TimeSpan.FromDays(29));
        var beforeExpiry = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, beforeExpiry.StatusCode);
        Assert.False(beforeExpiry.Headers.Contains("Set-Cookie"));
        host.Clock.Advance(TimeSpan.FromDays(1) + TimeSpan.FromSeconds(1));
        await AssertErrorAsync(await client.GetAsync("/api/auth/me"), HttpStatusCode.Unauthorized, "UNAUTHENTICATED");
    }

    [Fact]
    public async Task Policies_StaffOwnerAndTenant_EnforceServerIdentity()
    {
        var staff = await SeedUserAsync(RestaurantUserRole.Staff, false);
        var owner = await SeedUserAsync(RestaurantUserRole.Owner, false);
        using var host = new AccountTestHost(database);
        using var client = host.Browser();
        // Extra client-supplied claims cannot grant owner access or change restaurant ownership.
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(client, "/api/auth/login",
            new { staff.Username, password = InitialPassword, role = "OWNER", restaurantId = owner.RestaurantId })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/test-accounts/staff")).StatusCode);
        await AssertErrorAsync(await client.GetAsync("/api/test-accounts/owner"), HttpStatusCode.Forbidden, "FORBIDDEN");
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/test-accounts/restaurants/{owner.RestaurantId}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await client.GetAsync($"/api/test-accounts/restaurants/{staff.RestaurantId}")).StatusCode);
    }

    [Fact]
    public async Task Csrf_MissingForgedOrAnonymousTokenAfterLogin_RejectsMutation()
    {
        var user = await SeedUserAsync();
        using var host = new AccountTestHost(database);
        using var client = host.Browser();
        await AssertErrorAsync(await client.PostAsJsonAsync("/api/auth/login",
            new LoginRequest(user.Username, InitialPassword)), HttpStatusCode.BadRequest, "CSRF_VALIDATION_FAILED");
        await AssertErrorAsync(await PostAsync(client, "/api/auth/login",
            new LoginRequest(user.Username, InitialPassword), "forged"), HttpStatusCode.BadRequest, "CSRF_VALIDATION_FAILED");
        var anonymousToken = await CsrfAsync(client);
        await LoginAsync(client, user);
        await AssertErrorAsync(await PostAsync(client, "/api/auth/change-password",
            new ChangePasswordRequest(InitialPassword, NewPassword), anonymousToken),
            HttpStatusCode.BadRequest, "CSRF_VALIDATION_FAILED");
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(client, "/api/auth/change-password",
            new ChangePasswordRequest(InitialPassword, NewPassword))).StatusCode);
    }

    [Fact]
    public async Task Login_RateLimitedByUsernameAndIp_ReturnsRetryAfter()
    {
        var user = await SeedUserAsync();
        using var host = new AccountTestHost(database, lowLimits: true);
        using var client = host.Browser();
        await LoginAsync(client, user);
        await LoginAsync(client, user);
        var usernameLimited = await LoginAsync(client, user);
        await AssertErrorAsync(usernameLimited, HttpStatusCode.TooManyRequests, "RATE_LIMITED");
        Assert.NotNull(usernameLimited.Headers.RetryAfter);
        var ipLimited = await PostAsync(client, "/api/auth/login", new LoginRequest("different-name", InitialPassword));
        await AssertErrorAsync(ipLimited, HttpStatusCode.TooManyRequests, "RATE_LIMITED");
    }

    [Fact]
    public async Task ChangePassword_RateLimitedByAccount_ReturnsRetryAfter()
    {
        var user = await SeedUserAsync();
        using var host = new AccountTestHost(database, lowLimits: true);
        using var client = host.Browser();
        await LoginAsync(client, user);
        await PostAsync(client, "/api/auth/change-password", new ChangePasswordRequest("wrong", NewPassword));
        var response = await PostAsync(client, "/api/auth/change-password",
            new ChangePasswordRequest(InitialPassword, NewPassword));
        await AssertErrorAsync(response, HttpStatusCode.TooManyRequests, "RATE_LIMITED");
        Assert.NotNull(response.Headers.RetryAfter);
    }

    [Fact]
    public async Task Login_Production_SetsSecureCookie()
    {
        var user = await SeedUserAsync();
        using var host = new AccountTestHost(database, production: true);
        using var client = host.Browser();
        var response = await LoginAsync(client, user);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("secure", AuthCookie(response), StringComparison.OrdinalIgnoreCase);
    }

    private async Task<RestaurantUser> SeedUserAsync(
        RestaurantUserRole role = RestaurantUserRole.Owner, bool mustChange = true)
    {
        await using var context = database.CreateContext();
        var user = new RestaurantUser
        {
            Username = $"user_{Guid.NewGuid():N}", PasswordHash = "", Role = role,
            MustChangePassword = mustChange,
            Restaurant = new Restaurant { Name = "测试餐厅", DefaultLanguage = "zh" }
        };
        user.PasswordHash = new PasswordHasher<RestaurantUser>().HashPassword(user, InitialPassword);
        context.RestaurantUsers.Add(user);
        await context.SaveChangesAsync();
        return user;
    }

    private static Task<HttpResponseMessage> LoginAsync(HttpClient client, RestaurantUser user, string? username = null) =>
        PostAsync(client, "/api/auth/login", new LoginRequest(username ?? user.Username, InitialPassword));

    private static string AuthCookie(HttpResponseMessage response) =>
        response.Headers.GetValues("Set-Cookie").Single(value => value.StartsWith(StoreAuthentication.CookieName + "="));
}
