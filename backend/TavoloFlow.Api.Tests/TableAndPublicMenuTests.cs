using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Menus;
using TavoloFlow.Api.Tables;
using static TavoloFlow.Api.Tests.AccountTestHost;

namespace TavoloFlow.Api.Tests;

public sealed class TableAndPublicMenuTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    private const string Password = "Tables-test-password-123";
    private const string Tables = "/api/owner/tables";

    [Fact]
    public async Task Authorization_TableEndpoints_EnforcesIdentityRolePasswordAndCsrf()
    {
        using var host = new AccountTestHost(database);
        using var anonymous = host.Browser();
        await AssertErrorAsync(await anonymous.GetAsync("/api/staff/tables"), HttpStatusCode.Unauthorized, "UNAUTHENTICATED");
        var user = await SeedAsync();
        using var owner = await LoginAsync(host, user);
        var table = await CreateAsync(owner);
        using var staff = await LoginAsync(host, await SeedAsync(RestaurantUserRole.Staff, user.RestaurantId));
        Assert.Equal(table.Id, Assert.Single((await staff.GetFromJsonAsync<TableResponse[]>("/api/staff/tables"))!).Id);
        using var firstLogin = await LoginAsync(host, await SeedAsync(mustChange: true));
        await AssertErrorAsync(await firstLogin.GetAsync("/api/staff/tables"), HttpStatusCode.Forbidden, "PASSWORD_CHANGE_REQUIRED");
        foreach (var (method, path, body) in Writes(table.Id))
        {
            await AssertErrorAsync(await SendAsync(staff, method, path, body), HttpStatusCode.Forbidden, "FORBIDDEN");
            await AssertErrorAsync(await SendAsync(firstLogin, method, path, body), HttpStatusCode.Forbidden, "PASSWORD_CHANGE_REQUIRED");
            await AssertErrorAsync(await SendAsync(anonymous, method, path, body), HttpStatusCode.Unauthorized, "UNAUTHENTICATED");
            await AssertErrorAsync(await SendAsync(owner, method, path, body, false), HttpStatusCode.BadRequest, "CSRF_VALIDATION_FAILED");
        }
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" \t ")]
    [InlineData("123456789012345678901234567890123456789012345678901")]
    public async Task Labels_InvalidCreateOrRename_RejectsWithoutChangingTable(string? label)
    {
        using var host = new AccountTestHost(database);
        using var client = await LoginAsync(host, await SeedAsync());
        var table = await CreateAsync(client);
        foreach (var (method, path) in new[] { (HttpMethod.Post, Tables), (HttpMethod.Patch, $"{Tables}/{table.Id}/label") })
        {
            var response = await SendAsync(client, method, path, new { tableLabel = label });
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            var error = (await response.Content.ReadFromJsonAsync<ApiError>())!;
            Assert.Equal("VALIDATION_FAILED", error.Code);
            Assert.Contains("tableLabel", error.Errors!.Keys);
        }
        Assert.Equal(table, Assert.Single((await client.GetFromJsonAsync<TableResponse[]>("/api/staff/tables"))!));
    }

    [Fact]
    public async Task Tables_TwoRestaurants_RejectsForeignIdsAndExtraInputFields()
    {
        using var host = new AccountTestHost(database);
        var user = await SeedAsync();
        using var first = await LoginAsync(host, user);
        using var other = await LoginAsync(host, await SeedAsync());
        var table = await CreateAsync(first);
        Assert.Empty((await other.GetFromJsonAsync<TableResponse[]>("/api/staff/tables"))!);
        foreach (var (method, path, body) in Writes(table.Id).Skip(1))
            await AssertErrorAsync(await SendAsync(other, method, path, body), HttpStatusCode.NotFound, "TABLE_NOT_FOUND");
        foreach (var body in new object[] {
            new { tableLabel = "2", restaurantId = user.RestaurantId }, new { tableLabel = "2", qrToken = "chosen" },
            new { tableLabel = "2", isEnabled = false } })
            await AssertErrorAsync(await SendAsync(first, HttpMethod.Post, Tables, body), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        await AssertErrorAsync(await SendAsync(first, HttpMethod.Patch, $"{Tables}/{table.Id}/enabled", new { }), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        await AssertErrorAsync(await SendAsync(first, HttpMethod.Patch, $"{Tables}/{table.Id}/enabled", new { isEnabled = false, tableLabel = "oops" }), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        Assert.Equal(HttpStatusCode.Created, (await SendAsync(other, HttpMethod.Post, Tables, new { tableLabel = table.TableLabel })).StatusCode);
    }

    [Fact]
    public async Task Tables_ConcurrentCreateAndFieldUpdates_PreservesUniqueLabelsAndQr()
    {
        using var host = new AccountTestHost(database);
        var user = await SeedAsync();
        using var first = await LoginAsync(host, user);
        using var second = await LoginAsync(host, user);
        var creates = await Task.WhenAll(SendAsync(first, HttpMethod.Post, Tables, new { tableLabel = "  8  " }),
            SendAsync(second, HttpMethod.Post, Tables, new { tableLabel = "8" }));
        Assert.Single(creates, x => x.StatusCode == HttpStatusCode.Created);
        await AssertErrorAsync(Assert.Single(creates, x => x.StatusCode != HttpStatusCode.Created), HttpStatusCode.Conflict, "TABLE_LABEL_CONFLICT");
        var table = Assert.Single((await first.GetFromJsonAsync<TableResponse[]>("/api/staff/tables"))!);
        Assert.Equal("8", table.TableLabel);
        Assert.True(table.IsEnabled);
        Assert.Matches("^/q/[A-Za-z0-9_-]{43}$", table.QrPath);
        var updates = await Task.WhenAll(
            SendAsync(first, HttpMethod.Patch, $"{Tables}/{table.Id}/label", new { tableLabel = "  Patio  " }),
            SendAsync(second, HttpMethod.Patch, $"{Tables}/{table.Id}/enabled", new { isEnabled = false }));
        Assert.All(updates, response => Assert.Equal(HttpStatusCode.OK, response.StatusCode));
        var updated = Assert.Single((await first.GetFromJsonAsync<TableResponse[]>("/api/staff/tables"))!);
        Assert.Equal("Patio", updated.TableLabel);
        Assert.False(updated.IsEnabled);
        Assert.Equal(table.QrPath, updated.QrPath);
        await SendAsync(first, HttpMethod.Patch, $"{Tables}/{table.Id}/enabled", new { isEnabled = false });
        var another = await CreateAsync(first, "Other");
        await AssertErrorAsync(await SendAsync(first, HttpMethod.Patch, $"{Tables}/{another.Id}/label", new { tableLabel = "Patio" }), HttpStatusCode.Conflict, "TABLE_LABEL_CONFLICT");
        await CreateAsync(first, "patio"); // Database uniqueness remains case-sensitive.
    }

    [Fact]
    public async Task Delete_ActiveSession_RejectsAndKeepsQrAndHistoricalSnapshot()
    {
        using var host = new AccountTestHost(database);
        var user = await SeedAsync();
        using var owner = await LoginAsync(host, user);
        var table = await CreateAsync(owner);
        var session = await AddSessionAsync(user.RestaurantId, table, active: true);
        await SendAsync(owner, HttpMethod.Patch, $"{Tables}/{table.Id}/label", new { tableLabel = "New label" });
        await SendAsync(owner, HttpMethod.Patch, $"{Tables}/{table.Id}/enabled", new { isEnabled = false });
        var read = Assert.Single((await owner.GetFromJsonAsync<TableResponse[]>("/api/staff/tables"))!);
        Assert.Equal(session.Id, read.ActiveSessionId);
        await AssertErrorAsync(await SendAsync(owner, HttpMethod.Delete, $"{Tables}/{table.Id}"), HttpStatusCode.Conflict, "TABLE_HAS_ACTIVE_SESSION");
        using var anonymous = host.Browser();
        var menu = await anonymous.GetFromJsonAsync<PublicMenuResponse>(Bootstrap(table));
        Assert.Equal(session.Id, menu!.ActiveSessionId);
        Assert.False(menu.Table.IsEnabled);
        await using var context = database.CreateContext();
        Assert.Equal(table.TableLabel, (await context.DiningSessions.FindAsync(session.Id))!.TableLabelSnapshot);
    }

    [Fact]
    public async Task Delete_ClosedHistory_InvalidatesQrAndPreservesHistoryWhenRecreatingLabel()
    {
        using var host = new AccountTestHost(database);
        var user = await SeedAsync();
        using var owner = await LoginAsync(host, user);
        var table = await CreateAsync(owner);
        var session = await AddSessionAsync(user.RestaurantId, table, active: false);
        Assert.Equal(HttpStatusCode.NoContent, (await SendAsync(owner, HttpMethod.Delete, $"{Tables}/{table.Id}")).StatusCode);
        using var anonymous = host.Browser();
        await AssertErrorAsync(await anonymous.GetAsync(Bootstrap(table)), HttpStatusCode.NotFound, "QR_NOT_FOUND");
        await AssertErrorAsync(await anonymous.GetAsync("/api/public/qr/unknown/bootstrap"), HttpStatusCode.NotFound, "QR_NOT_FOUND");
        var replacement = await CreateAsync(owner, table.TableLabel);
        Assert.NotEqual(table.Id, replacement.Id);
        Assert.NotEqual(table.QrPath, replacement.QrPath);
        await using var read = database.CreateContext();
        var saved = await read.DiningSessions.Include(x => x.Orders).ThenInclude(x => x.Items).SingleAsync(x => x.Id == session.Id);
        Assert.Null(saved.TableId);
        Assert.Equal(table.TableLabel, saved.TableLabelSnapshot);
        Assert.Equal(user.RestaurantId, saved.RestaurantId);
        Assert.Equal(1250, saved.ClosedTotalCents);
        Assert.Equal("历史炒饭", Assert.Single(Assert.Single(saved.Orders).Items).NameZhSnapshot);
        Assert.Equal(1250, saved.Orders.Single().TotalAmountCents);
    }

    [Fact]
    public async Task Delete_FailureAfterDetachingHistory_RollsBackTableAndSessionReference()
    {
        using var host = new AccountTestHost(database);
        var user = await SeedAsync();
        using var owner = await LoginAsync(host, user);
        var table = await CreateAsync(owner);
        var session = await AddSessionAsync(user.RestaurantId, table, false);
        var failure = new FailDeleteInterceptor();
        await using (var context = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(database.ConnectionString).AddInterceptors(failure).Options))
            await Assert.ThrowsAsync<InjectedException>(() => new CatalogDeletionService(context).DeleteRestaurantTableAsync(user.RestaurantId, table.Id));
        Assert.True(failure.Detached);
        await using var read = database.CreateContext();
        Assert.True(await read.RestaurantTables.AnyAsync(x => x.Id == table.Id));
        Assert.Equal(table.Id, (await read.DiningSessions.FindAsync(session.Id))!.TableId);
    }

    [Fact]
    public async Task PublicMenu_AnonymousSuspendedAndDisabled_ReturnsOnlyCatalogAndNoWrites()
    {
        using var host = new AccountTestHost(database);
        var user = await SeedAsync();
        using var owner = await LoginAsync(host, user);
        var table = await CreateAsync(owner);
        await SendAsync(owner, HttpMethod.Patch, $"{Tables}/{table.Id}/enabled", new { isEnabled = false });
        var item = await AddMenuAsync(user.RestaurantId);
        await AddMenuAsync((await SeedAsync()).RestaurantId);
        using var anonymous = host.Browser();
        var response = await anonymous.GetAsync(Bootstrap(table));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl!.NoStore);
        Assert.False(response.Headers.Contains("Set-Cookie"));
        var responseText = await response.Content.ReadAsStringAsync();
        var result = JsonSerializer.Deserialize<PublicMenuResponse>(responseText, JsonSerializerOptions.Web)!;
        Assert.Equal(user.RestaurantId, result.Restaurant.Id);
        Assert.Equal("SUSPENDED", result.Restaurant.ServiceStatus);
        Assert.False(result.Restaurant.OrderingEnabled);
        Assert.False(result.Table.IsEnabled);
        Assert.Null(result.ActiveSessionId);
        Assert.Equal(item.Id, Assert.Single(result.Menu.Items).Id);
        Assert.False(result.Menu.Items[0].IsAvailable);
        Assert.False(result.Menu.Items[0].AllergenReviewed);
        Assert.Equal(new[] { "zh", "it" }, result.Menu.AvailableLanguages);
        using var json = JsonDocument.Parse(responseText);
        Assert.Equal(new[] { "activeSessionId", "menu", "restaurant", "table" }, json.RootElement.EnumerateObject().Select(x => x.Name).Order());
        var text = json.RootElement.GetRawText().ToLowerInvariant();
        foreach (var forbidden in new[] { "joincode", "ciphertext", "password", "credential", "billversion", "orders", "username" }) Assert.DoesNotContain(forbidden, text);
        await using var read = database.CreateContext();
        Assert.False(await read.DiningSessions.AnyAsync(x => x.RestaurantId == user.RestaurantId));
        Assert.False(await read.Orders.AnyAsync(x => x.RestaurantId == user.RestaurantId));
        // A valid first-password-change cookie cannot impose store policies on a public endpoint.
        using var restricted = await LoginAsync(host, await SeedAsync(mustChange: true));
        Assert.Equal(HttpStatusCode.OK, (await restricted.GetAsync(Bootstrap(table))).StatusCode);
    }

    [Fact]
    public async Task PublicMenu_ConcurrentChanges_UsesOneSnapshotForEntranceAndMenu()
    {
        using var host = new AccountTestHost(database);
        var user = await SeedAsync();
        using var owner = await LoginAsync(host, user);
        var table = await CreateAsync(owner);
        var item = await AddMenuAsync(user.RestaurantId);
        var change = new ChangeAfterEntranceInterceptor(async () =>
        {
            await using var update = database.CreateContext();
            await using var transaction = await update.Database.BeginTransactionAsync();
            await update.Restaurants.Where(x => x.Id == user.RestaurantId).ExecuteUpdateAsync(s =>
                s.SetProperty(x => x.DefaultLanguage, "en").SetProperty(x => x.OrderingEnabled, true));
            await update.RestaurantTables.Where(x => x.Id == table.Id).ExecuteUpdateAsync(s => s.SetProperty(x => x.TableLabel, "Changed"));
            await update.MenuCategories.Where(x => x.Id == item.CategoryId).ExecuteUpdateAsync(s => s.SetProperty(x => x.NameIt, "Nuovo"));
            await update.MenuItems.Where(x => x.Id == item.Id).ExecuteUpdateAsync(s =>
                s.SetProperty(x => x.PriceCents, 2500).SetProperty(x => x.IsAvailable, true));
            await transaction.CommitAsync();
        });
        await using var context = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(database.ConnectionString).AddInterceptors(change).Options);
        var result = await new PublicMenuService(context).ReadAsync(table.QrPath[3..], default);
        Assert.True(change.Changed);
        Assert.Equal("it", result.Restaurant.DefaultLanguage);
        Assert.False(result.Restaurant.OrderingEnabled);
        Assert.Equal(table.TableLabel, result.Table.TableLabel);
        Assert.Equal("Piatti", Assert.Single(result.Menu.Categories).NameIt);
        Assert.Equal(1250, Assert.Single(result.Menu.Items).PriceCents);
        Assert.False(result.Menu.Items[0].IsAvailable);
        using var anonymous = host.Browser();
        var latest = (await anonymous.GetFromJsonAsync<PublicMenuResponse>(Bootstrap(table)))!;
        Assert.Equal("en", latest.Restaurant.DefaultLanguage);
        Assert.Equal("Changed", latest.Table.TableLabel);
        Assert.Equal(2500, latest.Menu.Items[0].PriceCents);
        Assert.True(latest.Menu.Items[0].IsAvailable);
    }

    private async Task<RestaurantUser> SeedAsync(RestaurantUserRole role = RestaurantUserRole.Owner, Guid? restaurantId = null, bool mustChange = false)
    {
        await using var context = database.CreateContext();
        var user = new RestaurantUser { Username = $"tables_{Guid.NewGuid():N}", PasswordHash = "", Role = role, MustChangePassword = mustChange };
        if (restaurantId is { } id) user.RestaurantId = id;
        else user.Restaurant = new Restaurant { Name = "桌位测试餐厅", DefaultLanguage = "it" };
        user.PasswordHash = new PasswordHasher<RestaurantUser>().HashPassword(user, Password);
        context.RestaurantUsers.Add(user);
        await context.SaveChangesAsync();
        return user;
    }

    private async Task<MenuItem> AddMenuAsync(Guid restaurantId)
    {
        await using var context = database.CreateContext();
        var category = new MenuCategory { RestaurantId = restaurantId, NameIt = "Piatti" };
        var item = new MenuItem { RestaurantId = restaurantId, Category = category, NameZh = "炒饭", PriceCents = 1250,
            IsAvailable = false, AllergenReviewed = false };
        context.MenuItems.Add(item);
        await context.SaveChangesAsync();
        return item;
    }

    private async Task<DiningSession> AddSessionAsync(Guid restaurantId, TableResponse table, bool active)
    {
        await using var context = database.CreateContext();
        var session = new DiningSession { RestaurantId = restaurantId, TableId = table.Id, TableLabelSnapshot = table.TableLabel,
            OpenedAt = DateTime.UtcNow.AddHours(-1), Status = active ? DiningSessionStatus.Active : DiningSessionStatus.Closed,
            JoinCodeCiphertext = active ? "test-ciphertext-not-public" : null, ClosedAt = active ? null : DateTime.UtcNow,
            CloseReason = active ? null : SessionCloseReason.Paid, ClosedTotalCents = active ? null : 1250 };
        var order = new Order { RestaurantId = restaurantId, DiningSession = session, ClientRequestId = Guid.NewGuid(),
            DefaultLanguageSnapshot = "zh", TotalAmountCents = 1250 };
        context.OrderItems.Add(new OrderItem { RestaurantId = restaurantId, Order = order, NameZhSnapshot = "历史炒饭", UnitPriceCents = 1250, Quantity = 1 });
        await context.SaveChangesAsync();
        return session;
    }

    private static IEnumerable<(HttpMethod Method, string Path, object? Body)> Writes(Guid id)
    {
        yield return (HttpMethod.Post, Tables, new { tableLabel = "2" });
        yield return (HttpMethod.Patch, $"{Tables}/{id}/label", new { tableLabel = "2" });
        yield return (HttpMethod.Patch, $"{Tables}/{id}/enabled", new { isEnabled = false });
        yield return (HttpMethod.Delete, $"{Tables}/{id}", null);
    }
    private static string Bootstrap(TableResponse table) => $"/api/public/qr/{table.QrPath[3..]}/bootstrap";
    private static async Task<HttpClient> LoginAsync(AccountTestHost host, RestaurantUser user)
    {
        var client = host.Browser();
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(client, "/api/auth/login", new LoginRequest(user.Username, Password))).StatusCode);
        return client;
    }
    private static async Task<TableResponse> CreateAsync(HttpClient client, string label = "8")
    {
        var response = await SendAsync(client, HttpMethod.Post, Tables, new { tableLabel = label });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<TableResponse>())!;
    }
    private static async Task<HttpResponseMessage> SendAsync(HttpClient client, HttpMethod method, string path, object? body = null, bool csrf = true)
    {
        using var request = new HttpRequestMessage(method, path);
        if (body is not null) request.Content = JsonContent.Create(body);
        if (csrf) request.Headers.Add("X-CSRF-TOKEN", await CsrfAsync(client));
        return await client.SendAsync(request);
    }

    private sealed class InjectedException : Exception;
    private sealed class FailDeleteInterceptor : DbCommandInterceptor
    {
        public bool Detached { get; private set; }
        public override ValueTask<int> NonQueryExecutedAsync(DbCommand command, CommandExecutedEventData eventData, int result, CancellationToken ct = default)
        {
            if (command.CommandText.StartsWith("UPDATE") && command.CommandText.Contains("dining_sessions") && result == 1) Detached = true;
            return ValueTask.FromResult(result);
        }
        public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<int> result, CancellationToken ct = default)
        {
            if (command.CommandText.StartsWith("DELETE") && command.CommandText.Contains("restaurant_tables")) throw new InjectedException();
            return ValueTask.FromResult(result);
        }
    }
    private sealed class ChangeAfterEntranceInterceptor(Func<Task> change) : DbCommandInterceptor
    {
        public bool Changed { get; private set; }
        public override async ValueTask<DbDataReader> ReaderExecutedAsync(DbCommand command, CommandExecutedEventData eventData,
            DbDataReader result, CancellationToken ct = default)
        {
            if (!Changed && command.CommandText.Contains("restaurant_tables")) { Changed = true; await change(); }
            return result;
        }
    }
}
