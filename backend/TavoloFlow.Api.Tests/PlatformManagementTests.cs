using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Platform;
using static TavoloFlow.Api.Tests.AccountTestHost;
using static TavoloFlow.Api.Tests.PlatformAccountTests;

namespace TavoloFlow.Api.Tests;

public sealed class PlatformManagementTests(PostgreSqlFixture database)
    : IClassFixture<PostgreSqlFixture>
{
    private static CreateRestaurantInput Input() =>
        new(
            Guid.NewGuid(),
            "测试餐厅",
            "it",
            $"owner.{Guid.NewGuid():N}",
            $"staff.{Guid.NewGuid():N}"
        );

    private static async Task<CreatedRestaurant> Create(
        HttpClient admin,
        CreateRestaurantInput? input = null
    )
    {
        var response = await WriteAsync(admin, "/api/platform/restaurants", input ?? Input());
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<CreatedRestaurant>())!;
    }

    private async Task<HttpClient> Admin(AccountTestHost host)
    {
        var browser = host.Browser();
        Assert.Equal(
            HttpStatusCode.OK,
            (await LoginAsync(browser, await SeedAsync(database))).StatusCode
        );
        return browser;
    }

    private static async Task StoreLogin(
        HttpClient browser,
        TemporaryAccount account,
        bool change = true
    )
    {
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await PostAsync(
                    browser,
                    "/api/auth/login",
                    new { account.Account.Username, password = account.TemporaryPassword }
                )
            ).StatusCode
        );
        if (change)
            Assert.Equal(
                HttpStatusCode.OK,
                (
                    await PostAsync(
                        browser,
                        "/api/auth/change-password",
                        new
                        {
                            currentPassword = account.TemporaryPassword,
                            newPassword = NewPassword,
                        }
                    )
                ).StatusCode
            );
    }

    [Fact]
    public async Task Create_ValidInput_CreatesSuspendedRestaurantAndOneTimeCredentials()
    {
        using var host = new AccountTestHost(database);
        using var admin = await Admin(host);
        var created = await Create(admin);
        Assert.Equal("SUSPENDED", created.Restaurant.ServiceStatus);
        Assert.False(created.Restaurant.OrderingEnabled);
        Assert.Equal("EUR", created.Restaurant.CurrencyCode);
        Assert.Equal("Europe/Rome", created.Restaurant.TimeZone);
        Assert.Equal(2, created.Credentials.Length);
        Assert.NotEqual(
            created.Credentials[0].TemporaryPassword,
            created.Credentials[1].TemporaryPassword
        );
        Assert.All(
            created.Credentials,
            c =>
            {
                Assert.True(c.Account.MustChangePassword);
                Assert.True(AccountInput.IsValidPassword(c.TemporaryPassword));
            }
        );
        var detail = await admin.GetStringAsync(
            $"/api/platform/restaurants/{created.Restaurant.Id}"
        );
        Assert.DoesNotContain("temporaryPassword", detail);
        Assert.DoesNotContain("passwordHash", detail);
        foreach (var c in created.Credentials)
            Assert.DoesNotContain(c.TemporaryPassword, detail);
        using var owner = host.Browser();
        await StoreLogin(owner, created.Credentials.Single(c => c.Account.Role == "OWNER"), false);
        await AssertErrorAsync(
            await owner.GetAsync("/api/staff/menu"),
            HttpStatusCode.Forbidden,
            "PASSWORD_CHANGE_REQUIRED"
        );
    }

    [Fact]
    public async Task Create_UsernameConflict_RollsBackWholeRestaurant()
    {
        using var host = new AccountTestHost(database);
        using var admin = await Admin(host);
        var input = Input();
        await Create(admin, input);
        var conflict = Input() with { StaffUsername = input.OwnerUsername };
        await AssertErrorAsync(
            await WriteAsync(admin, "/api/platform/restaurants", conflict),
            HttpStatusCode.Conflict,
            "CREATE_CONFLICT"
        );
        await using var db = database.CreateContext();
        Assert.False(await db.Restaurants.AnyAsync(r => r.Id == conflict.Id));
        Assert.False(await db.RestaurantUsers.AnyAsync(u => u.Username == conflict.OwnerUsername));
    }

    [Fact]
    public async Task Create_ConcurrentSameId_OnlyOneRestaurantIsCreated()
    {
        using var host = new AccountTestHost(database);
        using var admin = await Admin(host);
        var input = Input();
        var results = await Task.WhenAll(
            WriteAsync(admin, "/api/platform/restaurants", input),
            WriteAsync(admin, "/api/platform/restaurants", input)
        );
        Assert.Single(results, r => r.StatusCode == HttpStatusCode.Created);
        Assert.Single(results, r => r.StatusCode == HttpStatusCode.Conflict);
        await using var db = database.CreateContext();
        Assert.Equal(1, await db.Restaurants.CountAsync(r => r.Id == input.Id));
        Assert.Equal(2, await db.RestaurantUsers.CountAsync(u => u.RestaurantId == input.Id));
    }

    [Fact]
    public async Task Identity_SameBrowserPlatformAndStore_LogoutAndCsrfRemainIsolated()
    {
        using var host = new AccountTestHost(database);
        using var browser = await Admin(host);
        var restaurant = await Create(browser);
        await StoreLogin(browser, restaurant.Credentials.Single(c => c.Account.Role == "OWNER"));
        Assert.Equal(
            HttpStatusCode.OK,
            (await browser.GetAsync("/api/platform/auth/me")).StatusCode
        );
        Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync("/api/auth/me")).StatusCode);
        await AssertErrorAsync(
            await WriteAsync(
                browser,
                $"/api/platform/restaurants/{restaurant.Restaurant.Id}/service-status",
                new { status = "ACTIVE" },
                HttpMethod.Patch,
                "/api/auth/csrf"
            ),
            HttpStatusCode.BadRequest,
            "CSRF_VALIDATION_FAILED"
        );
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await WriteAsync(browser, "/api/platform/auth/logout", new { })).StatusCode
        );
        Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync("/api/auth/me")).StatusCode);
        await AssertErrorAsync(
            await browser.GetAsync("/api/platform/restaurants"),
            HttpStatusCode.Unauthorized,
            "UNAUTHENTICATED"
        );
    }

    [Fact]
    public async Task Reset_OwnerCanOnlyResetOwnStaff_RevokesOldTicketsAndRequiresChange()
    {
        using var host = new AccountTestHost(database);
        using var admin = await Admin(host);
        var a = await Create(admin);
        var b = await Create(admin);
        using var owner = host.Browser();
        using var staff = host.Browser();
        await StoreLogin(owner, a.Credentials.Single(c => c.Account.Role == "OWNER"));
        await StoreLogin(staff, a.Credentials.Single(c => c.Account.Role == "STAFF"));
        var target = (await owner.GetFromJsonAsync<ManagedAccount>("/api/owner/staff"))!;
        await AssertErrorAsync(
            await staff.GetAsync("/api/owner/staff"),
            HttpStatusCode.Forbidden,
            "FORBIDDEN"
        );
        await AssertErrorAsync(
            await PostAsync(
                owner,
                "/api/owner/staff/reset-password",
                new
                {
                    expectedCredentialVersion = target.CredentialVersion,
                    userId = b.Credentials[0].Account.Id,
                }
            ),
            HttpStatusCode.BadRequest,
            "VALIDATION_FAILED"
        );
        var response = await PostAsync(
            owner,
            "/api/owner/staff/reset-password",
            new { expectedCredentialVersion = target.CredentialVersion }
        );
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var reset = (await response.Content.ReadFromJsonAsync<TemporaryAccount>())!;
        Assert.Equal(target.Id, reset.Account.Id);
        Assert.Equal(target.CredentialVersion + 1, reset.Account.CredentialVersion);
        await AssertErrorAsync(
            await staff.GetAsync("/api/auth/me"),
            HttpStatusCode.Unauthorized,
            "UNAUTHENTICATED"
        );
        await StoreLogin(staff, reset, false);
        await AssertErrorAsync(
            await staff.GetAsync("/api/staff/floor"),
            HttpStatusCode.Forbidden,
            "PASSWORD_CHANGE_REQUIRED"
        );
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Reset_ConcurrentSameVersion_OneSecretWinsAndCrossTenantIsRejected()
    {
        using var host = new AccountTestHost(database);
        using var admin = await Admin(host);
        var a = await Create(admin);
        var b = await Create(admin);
        var target = a.Credentials[0].Account;
        var path = $"/api/platform/restaurants/{a.Restaurant.Id}/users/{target.Id}/reset-password";
        var results = await Task.WhenAll(
            WriteAsync(admin, path, new { expectedCredentialVersion = 1 }),
            WriteAsync(admin, path, new { expectedCredentialVersion = 1 })
        );
        Assert.Single(results, r => r.StatusCode == HttpStatusCode.OK);
        await AssertErrorAsync(
            results.Single(r => r.StatusCode != HttpStatusCode.OK),
            HttpStatusCode.Conflict,
            "ACCOUNT_CHANGED"
        );
        await AssertErrorAsync(
            await WriteAsync(
                admin,
                $"/api/platform/restaurants/{b.Restaurant.Id}/users/{target.Id}/reset-password",
                new { expectedCredentialVersion = 2 }
            ),
            HttpStatusCode.NotFound,
            "ACCOUNT_NOT_FOUND"
        );
    }

    [Fact]
    public async Task Active_ChangesAndRepeats_IncrementOnlyOnActualChange()
    {
        using var host = new AccountTestHost(database);
        using var admin = await Admin(host);
        var a = await Create(admin);
        var target = a.Credentials[0].Account;
        var path = $"/api/platform/restaurants/{a.Restaurant.Id}/users/{target.Id}/active";
        var same = await WriteAsync(
            admin,
            path,
            new { isActive = true, expectedCredentialVersion = 1 },
            HttpMethod.Patch
        );
        Assert.Equal(
            1,
            (await same.Content.ReadFromJsonAsync<ManagedAccount>())!.CredentialVersion
        );
        var disabled = await WriteAsync(
            admin,
            path,
            new { isActive = false, expectedCredentialVersion = 1 },
            HttpMethod.Patch
        );
        Assert.Equal(
            2,
            (await disabled.Content.ReadFromJsonAsync<ManagedAccount>())!.CredentialVersion
        );
        await AssertErrorAsync(
            await WriteAsync(
                admin,
                path,
                new { isActive = true, expectedCredentialVersion = 1 },
                HttpMethod.Patch
            ),
            HttpStatusCode.Conflict,
            "ACCOUNT_CHANGED"
        );
        using var store = host.Browser();
        await AssertErrorAsync(
            await PostAsync(
                store,
                "/api/auth/login",
                new { username = target.Username, password = a.Credentials[0].TemporaryPassword }
            ),
            HttpStatusCode.Unauthorized,
            "INVALID_CREDENTIALS"
        );
    }

    [Fact]
    public async Task Suspend_RacingEnable_CannotLeaveSuspendedRestaurantAcceptingOrders()
    {
        using var host = new AccountTestHost(database);
        using var admin = await Admin(host);
        var a = await Create(admin);
        var statusPath = $"/api/platform/restaurants/{a.Restaurant.Id}/service-status";
        await WriteAsync(admin, statusPath, new { status = "ACTIVE" }, HttpMethod.Patch);
        using var owner = host.Browser();
        await StoreLogin(owner, a.Credentials.Single(c => c.Account.Role == "OWNER"));
        var enable = WriteAsync(
            owner,
            "/api/staff/accepting-orders",
            new { enabled = true },
            HttpMethod.Patch,
            "/api/auth/csrf"
        );
        var suspend = WriteAsync(admin, statusPath, new { status = "SUSPENDED" }, HttpMethod.Patch);
        var results = await Task.WhenAll(enable, suspend);
        Assert.Equal(HttpStatusCode.OK, results[1].StatusCode);
        Assert.Contains(
            results[0].StatusCode,
            new[] { HttpStatusCode.OK, HttpStatusCode.Conflict }
        );
        var detail = (
            await admin.GetFromJsonAsync<RestaurantDetail>(
                $"/api/platform/restaurants/{a.Restaurant.Id}"
            )
        )!;
        Assert.Equal("SUSPENDED", detail.Restaurant.ServiceStatus);
        Assert.False(detail.Restaurant.OrderingEnabled);
        await AssertErrorAsync(
            await WriteAsync(
                owner,
                "/api/staff/accepting-orders",
                new { enabled = true },
                HttpMethod.Patch,
                "/api/auth/csrf"
            ),
            HttpStatusCode.Conflict,
            "SERVICE_SUSPENDED"
        );
        await WriteAsync(admin, statusPath, new { status = "ACTIVE" }, HttpMethod.Patch);
        Assert.False(
            (
                await admin.GetFromJsonAsync<RestaurantDetail>(
                    $"/api/platform/restaurants/{a.Restaurant.Id}"
                )
            )!
                .Restaurant
                .OrderingEnabled
        );
    }

    [Fact]
    public async Task Delete_ActiveRestaurant_ReturnsNotSuspendedAndKeepsData()
    {
        using var host = new AccountTestHost(database);
        using var admin = await Admin(host);
        var a = await Create(admin);
        var path = $"/api/platform/restaurants/{a.Restaurant.Id}";
        await WriteAsync(
            admin,
            $"{path}/service-status",
            new { status = "ACTIVE" },
            HttpMethod.Patch
        );
        await AssertErrorAsync(
            await WriteAsync(admin, path, new { }, HttpMethod.Delete),
            HttpStatusCode.Conflict,
            "RESTAURANT_NOT_SUSPENDED"
        );
        var detail = (await admin.GetFromJsonAsync<RestaurantDetail>(path))!;
        Assert.Equal("ACTIVE", detail.Restaurant.ServiceStatus);
        Assert.Equal(2, detail.Accounts.Length);
    }

    [Fact]
    public async Task Delete_SuspendedRestaurant_RemovesTenantAndRevokesStoreLogin()
    {
        using var host = new AccountTestHost(database);
        using var admin = await Admin(host);
        var a = await Create(admin);
        var b = await Create(admin);
        var path = $"/api/platform/restaurants/{a.Restaurant.Id}";
        using var owner = host.Browser();
        await StoreLogin(owner, a.Credentials.Single(c => c.Account.Role == "OWNER"));
        await AssertErrorAsync(
            await WriteAsync(admin, path, new { }, HttpMethod.Delete, "/api/auth/csrf"),
            HttpStatusCode.BadRequest,
            "CSRF_VALIDATION_FAILED"
        );
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await WriteAsync(admin, path, new { }, HttpMethod.Delete)).StatusCode
        );
        await AssertErrorAsync(
            await admin.GetAsync(path),
            HttpStatusCode.NotFound,
            "RESTAURANT_NOT_FOUND"
        );
        // A repeated or late request finds nothing to delete.
        await AssertErrorAsync(
            await WriteAsync(admin, path, new { }, HttpMethod.Delete),
            HttpStatusCode.NotFound,
            "RESTAURANT_NOT_FOUND"
        );
        await AssertErrorAsync(
            await owner.GetAsync("/api/auth/me"),
            HttpStatusCode.Unauthorized,
            "UNAUTHENTICATED"
        );
        Assert.Equal(
            HttpStatusCode.OK,
            (await admin.GetAsync($"/api/platform/restaurants/{b.Restaurant.Id}")).StatusCode
        );
        await using var db = database.CreateContext();
        Assert.False(await db.RestaurantUsers.AnyAsync(u => u.RestaurantId == a.Restaurant.Id));
        Assert.Equal(
            2,
            await db.RestaurantUsers.CountAsync(u => u.RestaurantId == b.Restaurant.Id)
        );
    }

    [Fact]
    public async Task List_FilterAndPagination_ReturnOnlyRequestedRestaurants()
    {
        using var host = new AccountTestHost(database);
        using var admin = await Admin(host);
        var prefix = Guid.NewGuid().ToString("N");
        for (var i = 0; i < 3; i++)
            await Create(admin, Input() with { Name = prefix + i });
        var page = (
            await admin.GetFromJsonAsync<RestaurantPage>(
                $"/api/platform/restaurants?search={prefix}&status=SUSPENDED&pageSize=2"
            )
        )!;
        Assert.Equal(3, page.TotalCount);
        Assert.Equal(2, page.Items.Length);
        var next = (
            await admin.GetFromJsonAsync<RestaurantPage>(
                $"/api/platform/restaurants?search={prefix}&status=SUSPENDED&pageSize=2&page=2"
            )
        )!;
        Assert.Single(next.Items);
        Assert.DoesNotContain(next.Items[0].Id, page.Items.Select(r => r.Id));
    }

    [Fact]
    public async Task GoogleMapsUrl_CreateUpdateAndClear_AcceptsOnlyGoogleHttpsLinks()
    {
        using var host = new AccountTestHost(database);
        using var admin = await Admin(host);
        await AssertErrorAsync(
            await WriteAsync(
                admin,
                "/api/platform/restaurants",
                Input() with
                {
                    GoogleMapsUrl = "http://maps.google.com/?q=Roma",
                }
            ),
            HttpStatusCode.BadRequest,
            "VALIDATION_FAILED"
        );
        var created = await Create(
            admin,
            Input() with
            {
                GoogleMapsUrl = " https://maps.app.goo.gl/AbC123 ",
            }
        );
        Assert.Equal("https://maps.app.goo.gl/AbC123", created.Restaurant.GoogleMapsUrl);
        var path = $"/api/platform/restaurants/{created.Restaurant.Id}/google-maps-url";
        foreach (
            var invalid in new[]
            {
                "javascript:alert(1)",
                "http://maps.google.com/?q=Roma",
                "https://example.com/maps/place/Roma",
                "https://www.google.com/search?q=Roma",
                "https://user@maps.app.goo.gl/AbC123",
            }
        )
            await AssertErrorAsync(
                await WriteAsync(admin, path, new { googleMapsUrl = invalid }, HttpMethod.Patch),
                HttpStatusCode.BadRequest,
                "VALIDATION_FAILED"
            );
        const string place = "https://www.google.it/maps/place/Colosseo";
        var updated = await WriteAsync(
            admin,
            path,
            new { googleMapsUrl = place },
            HttpMethod.Patch
        );
        Assert.Equal(
            place,
            (await updated.Content.ReadFromJsonAsync<RestaurantSummary>())!.GoogleMapsUrl
        );
        Assert.Equal(
            place,
            (
                await admin.GetFromJsonAsync<RestaurantDetail>(
                    $"/api/platform/restaurants/{created.Restaurant.Id}"
                )
            )!
                .Restaurant
                .GoogleMapsUrl
        );
        // The link is reserved for platform pages: the store identity never receives it.
        using var owner = host.Browser();
        await StoreLogin(owner, created.Credentials.Single(c => c.Account.Role == "OWNER"));
        foreach (var storePath in new[] { "/api/auth/me", "/api/owner/subscription" })
            Assert.DoesNotContain("googleMapsUrl", await owner.GetStringAsync(storePath));
        var cleared = await WriteAsync(
            admin,
            path,
            new { googleMapsUrl = (string?)null },
            HttpMethod.Patch
        );
        Assert.Null((await cleared.Content.ReadFromJsonAsync<RestaurantSummary>())!.GoogleMapsUrl);
        await AssertErrorAsync(
            await WriteAsync(
                admin,
                $"/api/platform/restaurants/{Guid.NewGuid()}/google-maps-url",
                new { googleMapsUrl = place },
                HttpMethod.Patch
            ),
            HttpStatusCode.NotFound,
            "RESTAURANT_NOT_FOUND"
        );
    }

    [Fact]
    public async Task JoinCodeRequired_CreateAndToggle_UpdatesOnlyThatSetting()
    {
        using var host = new AccountTestHost(database);
        using var admin = await Admin(host);
        Assert.True((await Create(admin)).Restaurant.JoinCodeRequired);
        var created = await Create(admin, Input() with { JoinCodeRequired = false });
        Assert.False(created.Restaurant.JoinCodeRequired);
        var id = created.Restaurant.Id;
        var path = $"/api/platform/restaurants/{id}/join-code-required";
        foreach (
            var invalid in new object[] { new { }, new { joinCodeRequired = true, extra = 1 } }
        )
            await AssertErrorAsync(
                await WriteAsync(admin, path, invalid, HttpMethod.Patch),
                HttpStatusCode.BadRequest,
                "VALIDATION_FAILED"
            );
        var enabled = await WriteAsync(
            admin,
            path,
            new { joinCodeRequired = true },
            HttpMethod.Patch
        );
        var summary = (await enabled.Content.ReadFromJsonAsync<RestaurantSummary>())!;
        Assert.True(summary.JoinCodeRequired);
        Assert.Equal(created.Restaurant with { JoinCodeRequired = true }, summary);
        Assert.True(
            (await admin.GetFromJsonAsync<RestaurantDetail>($"/api/platform/restaurants/{id}"))!
                .Restaurant
                .JoinCodeRequired
        );
        await AssertErrorAsync(
            await WriteAsync(
                admin,
                $"/api/platform/restaurants/{Guid.NewGuid()}/join-code-required",
                new { joinCodeRequired = false },
                HttpMethod.Patch
            ),
            HttpStatusCode.NotFound,
            "RESTAURANT_NOT_FOUND"
        );
        // Only the platform changes it: a store OWNER has no platform identity.
        using var owner = host.Browser();
        await StoreLogin(owner, created.Credentials.Single(c => c.Account.Role == "OWNER"));
        await AssertErrorAsync(
            await WriteAsync(owner, path, new { joinCodeRequired = false }, HttpMethod.Patch),
            HttpStatusCode.Unauthorized,
            "UNAUTHENTICATED"
        );
        await using var db = database.CreateContext();
        Assert.True(
            await db
                .Restaurants.Where(r => r.Id == id)
                .Select(r => r.JoinCodeRequired)
                .SingleAsync()
        );
    }

    [Fact]
    public async Task Theme_CreateAndChange_ReachesStoreAndGuestPagesAndOnlyPlatformWrites()
    {
        using var host = new AccountTestHost(database);
        using var admin = await Admin(host);
        Assert.Equal("TERRACOTTA", (await Create(admin)).Restaurant.Theme);
        foreach (var invalid in new[] { "ocean", "lacquer", " INK", "" })
            await AssertErrorAsync(
                await WriteAsync(
                    admin,
                    "/api/platform/restaurants",
                    Input() with
                    {
                        Theme = invalid,
                    }
                ),
                HttpStatusCode.BadRequest,
                "VALIDATION_FAILED"
            );
        var created = await Create(admin, Input() with { Theme = "LACQUER" });
        Assert.Equal("LACQUER", created.Restaurant.Theme);
        var id = created.Restaurant.Id;
        var path = $"/api/platform/restaurants/{id}/theme";
        foreach (
            var invalid in new object[]
            {
                new { },
                new { theme = "TARO", extra = 1 },
                new { theme = "1" },
                new { theme = "Taro" },
            }
        )
            await AssertErrorAsync(
                await WriteAsync(admin, path, invalid, HttpMethod.Patch),
                HttpStatusCode.BadRequest,
                "VALIDATION_FAILED"
            );
        var changed = await WriteAsync(admin, path, new { theme = "TARO" }, HttpMethod.Patch);
        Assert.Equal(
            created.Restaurant with
            {
                Theme = "TARO",
            },
            await changed.Content.ReadFromJsonAsync<RestaurantSummary>()
        );
        Assert.Equal(
            "TARO",
            (await admin.GetFromJsonAsync<RestaurantDetail>($"/api/platform/restaurants/{id}"))!
                .Restaurant
                .Theme
        );
        await AssertErrorAsync(
            await WriteAsync(
                admin,
                $"/api/platform/restaurants/{Guid.NewGuid()}/theme",
                new { theme = "INK" },
                HttpMethod.Patch
            ),
            HttpStatusCode.NotFound,
            "RESTAURANT_NOT_FOUND"
        );

        // The signed-in store pages and the anonymous QR menu both read it.
        using var owner = host.Browser();
        await StoreLogin(owner, created.Credentials.Single(c => c.Account.Role == "OWNER"));
        Assert.Equal(
            "TARO",
            (await owner.GetFromJsonAsync<CurrentAccountResponse>("/api/auth/me"))!.RestaurantTheme
        );
        await using var db = database.CreateContext();
        var table = new RestaurantTable
        {
            RestaurantId = id,
            TableLabel = "1",
            QrToken = Guid.NewGuid().ToString("N"),
        };
        db.RestaurantTables.Add(table);
        await db.SaveChangesAsync();
        using var guest = host.Browser();
        Assert.Equal(
            "TARO",
            (
                await guest.GetFromJsonAsync<Menus.PublicMenuResponse>(
                    $"/api/public/qr/{table.QrToken}/bootstrap"
                )
            )!
                .Restaurant
                .Theme
        );
        await AssertErrorAsync(
            await WriteAsync(owner, path, new { theme = "INK" }, HttpMethod.Patch),
            HttpStatusCode.Unauthorized,
            "UNAUTHENTICATED"
        );
        Assert.Equal(
            RestaurantTheme.Taro,
            await db.Restaurants.Where(r => r.Id == id).Select(r => r.Theme).SingleAsync()
        );
    }
}
