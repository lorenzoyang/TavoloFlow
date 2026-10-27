using System.Data.Common;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using SkiaSharp;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Menus;
using static TavoloFlow.Api.Tests.AccountTestHost;

namespace TavoloFlow.Api.Tests;

public sealed class MenuTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    private const string Password = "Menu-test-password-123";
    private const string Categories = "/api/owner/menu/categories";
    private const string Items = "/api/owner/menu/items";
    private const string DefaultLanguage = "/api/owner/menu/default-language";

    [Fact]
    public async Task Categories_SuspendedRestaurant_NormalizesEditsAndDeletes()
    {
        using var host = new AccountTestHost(database);
        using var client = await LoginAsync(host, await SeedAsync());
        var empty = await ReadAsync(client);
        Assert.Empty(empty.Categories);
        Assert.Empty(empty.AvailableLanguages);
        Assert.Equal("it", empty.DefaultLanguage);
        Assert.Equal(14, empty.Allergens.Count);
        var category = await CreateCategoryAsync(client, new("  主食  ", "  ", null));
        Assert.Equal("主食", category.NameZh);
        Assert.Null(category.NameIt);
        Assert.Equal("it", (await ReadAsync(client)).DefaultLanguage);
        var updated = await SendAsync(client, HttpMethod.Put, $"{Categories}/{category.Id}", new CategoryInput(null, null, "Rice"));
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        Assert.Equal("it", (await ReadAsync(client)).DefaultLanguage);
        Assert.Equal(HttpStatusCode.NoContent, (await SendAsync(client, HttpMethod.Delete, $"{Categories}/{category.Id}")).StatusCode);
        var after = await ReadAsync(client);
        Assert.Empty(after.Categories);
        Assert.Equal("it", after.DefaultLanguage);
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(client, HttpMethod.Patch, DefaultLanguage, new { defaultLanguage = "zh" })).StatusCode);
        Assert.Equal("zh", (await ReadAsync(client)).DefaultLanguage);
    }

    [Fact]
    public async Task Authorization_AnonymousFirstPasswordStaffAndCsrf_EnforcesActualMenuEndpoints()
    {
        using var host = new AccountTestHost(database);
        using var anonymous = host.Browser();
        await AssertErrorAsync(await anonymous.GetAsync("/api/staff/menu"), HttpStatusCode.Unauthorized, "UNAUTHENTICATED");
        var ownerUser = await SeedAsync();
        using var owner = await LoginAsync(host, ownerUser);
        var category = await CreateCategoryAsync(owner);
        var item = await CreateItemAsync(owner, ValidItem(category.Id));
        using var firstLogin = await LoginAsync(host, await SeedAsync(mustChange: true));
        await AssertErrorAsync(await firstLogin.GetAsync("/api/staff/menu"), HttpStatusCode.Forbidden, "PASSWORD_CHANGE_REQUIRED");
        using var staff = await LoginAsync(host, await SeedAsync(RestaurantUserRole.Staff, ownerUser.RestaurantId));
        Assert.Single((await ReadAsync(staff)).Items);
        foreach (var (method, path, body) in new (HttpMethod, string, object?)[]
        {
            (HttpMethod.Post, Categories, new CategoryInput("test", null, null)),
            (HttpMethod.Put, $"{Categories}/{category.Id}", new CategoryInput("test", null, null)),
            (HttpMethod.Delete, $"{Categories}/{category.Id}", null),
            (HttpMethod.Post, Items, ValidItem(category.Id)),
            (HttpMethod.Put, $"{Items}/{item.Id}", ValidItem(category.Id)),
            (HttpMethod.Delete, $"{Items}/{item.Id}", null),
            (HttpMethod.Patch, DefaultLanguage, new { defaultLanguage = "zh" })
        }) await AssertErrorAsync(await SendAsync(staff, method, path, body), HttpStatusCode.Forbidden, "FORBIDDEN");
        foreach (var (method, path, body) in new (HttpMethod, string, object?)[]
        {
            (HttpMethod.Post, Categories, new CategoryInput("test", null, null)),
            (HttpMethod.Put, $"{Items}/{item.Id}", ValidItem(category.Id)),
            (HttpMethod.Delete, $"{Items}/{item.Id}", null),
            (HttpMethod.Patch, Availability(item.Id), new { isAvailable = false })
        }) await AssertErrorAsync(await SendAsync(owner, method, path, body, csrf: false), HttpStatusCode.BadRequest, "CSRF_VALIDATION_FAILED");
        await AssertErrorAsync(await SendAsync(staff, HttpMethod.Patch, Availability(item.Id), new { isAvailable = false, priceCents = 1 }), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        await AssertErrorAsync(await SendAsync(staff, HttpMethod.Patch, Availability(item.Id), new { }), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(staff, HttpMethod.Patch, Availability(item.Id), new { isAvailable = false })).StatusCode);
    }

    [Fact]
    public async Task Menu_TwoRestaurants_HidesAndProtectsForeignResources()
    {
        using var host = new AccountTestHost(database);
        using var first = await LoginAsync(host, await SeedAsync());
        using var other = await LoginAsync(host, await SeedAsync());
        var category = await CreateCategoryAsync(first);
        var item = await CreateItemAsync(first, ValidItem(category.Id));
        var otherCategory = await CreateCategoryAsync(other);
        Assert.Empty((await ReadAsync(other)).Items);
        Assert.DoesNotContain((await ReadAsync(other)).Categories, value => value.Id == category.Id);
        foreach (var (method, path, body) in new (HttpMethod, string, object?)[]
        {
            (HttpMethod.Put, $"{Categories}/{category.Id}", new CategoryInput("foreign", null, null)),
            (HttpMethod.Delete, $"{Categories}/{category.Id}", null),
            (HttpMethod.Put, $"{Items}/{item.Id}", ValidItem(otherCategory.Id)),
            (HttpMethod.Delete, $"{Items}/{item.Id}", null),
            (HttpMethod.Patch, Availability(item.Id), new { isAvailable = false }),
            (HttpMethod.Post, Items, ValidItem(category.Id))
        }) await AssertErrorAsync(await SendAsync(other, method, path, body), HttpStatusCode.NotFound, "MENU_RESOURCE_NOT_FOUND");
        await AssertErrorAsync(await SendAsync(first, HttpMethod.Put, $"{Items}/{item.Id}", ValidItem(otherCategory.Id)), HttpStatusCode.NotFound, "MENU_RESOURCE_NOT_FOUND");
        Assert.Equal(category.Id, Assert.Single((await ReadAsync(first)).Items).CategoryId);
    }

    [Theory]
    [InlineData("names")]
    [InlineData("nameLength")]
    [InlineData("codeLength")]
    [InlineData("description")]
    [InlineData("zero")]
    [InlineData("negative")]
    [InlineData("unsafe")]
    [InlineData("unreviewed")]
    [InlineData("unknownCode")]
    [InlineData("nullCodes")]
    public async Task Items_InvalidCreateAndEdit_PreservesSavedContentAndLanguage(string scenario)
    {
        using var host = new AccountTestHost(database);
        using var client = await LoginAsync(host, await SeedAsync());
        var category = await CreateCategoryAsync(client);
        var original = ValidItem(category.Id);
        var item = await CreateItemAsync(client, original);
        var invalid = scenario switch
        {
            "names" => original with { NameZh = " ", NameIt = null, NameEn = null },
            "nameLength" => original with { NameZh = new string('x', 151) },
            "codeLength" => original with { ItemCode = new string('x', 41) },
            "description" => original with { DescriptionIt = "Without a name" },
            "zero" => original with { PriceCents = 0 },
            "negative" => original with { PriceCents = -1 },
            "unsafe" => original with { PriceCents = InputRules.MaxSafeCents + 1 },
            "unreviewed" => original with { AllergenReviewed = false },
            "unknownCode" => original with { AllergenCodes = ["UNKNOWN"] },
            _ => original with { AllergenCodes = null }
        };
        foreach (var (method, path) in new[] { (HttpMethod.Post, Items), (HttpMethod.Put, $"{Items}/{item.Id}") })
        {
            var response = await SendAsync(client, method, path, invalid);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            var error = (await response.Content.ReadFromJsonAsync<ApiError>())!;
            Assert.Equal("VALIDATION_FAILED", error.Code);
            Assert.NotEmpty(error.Errors!);
            Assert.False(string.IsNullOrWhiteSpace(error.RequestId));
        }
        var menu = await ReadAsync(client);
        var saved = Assert.Single(menu.Items);
        Assert.Equal(item.NameZh, saved.NameZh);
        Assert.Equal(item.PriceCents, saved.PriceCents);
        Assert.Equal(item.AllergenCodes, saved.AllergenCodes);
        Assert.Equal("it", menu.DefaultLanguage);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("tooLong")]
    public async Task Categories_InvalidNames_DoesNotWrite(string name)
    {
        using var host = new AccountTestHost(database);
        using var client = await LoginAsync(host, await SeedAsync());
        var input = new CategoryInput(name == "tooLong" ? new string('x', 101) : name, null, null);
        await AssertErrorAsync(await SendAsync(client, HttpMethod.Post, Categories, input), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        Assert.Empty((await ReadAsync(client)).Categories);
    }

    [Fact]
    public async Task Items_MoveCodeReuseAndSoldOutEdit_PreservesFieldBoundaries()
    {
        using var host = new AccountTestHost(database);
        using var client = await LoginAsync(host, await SeedAsync());
        var first = await CreateCategoryAsync(client);
        var second = await CreateCategoryAsync(client);
        var input = ValidItem(first.Id) with { ItemCode = " A1 ", AllergenCodes = ["SOY", "GLUTEN", "SOY"] };
        var item = await CreateItemAsync(client, input);
        Assert.Equal("A1", item.ItemCode);
        Assert.Equal(new[] { "GLUTEN", "SOY" }, item.AllergenCodes);
        Assert.True(item.IsAvailable);
        await AssertErrorAsync(await SendAsync(client, HttpMethod.Delete, $"{Categories}/{first.Id}"), HttpStatusCode.Conflict, "CATEGORY_NOT_EMPTY");
        await AssertErrorAsync(await SendAsync(client, HttpMethod.Post, Items, input), HttpStatusCode.Conflict, "ITEM_CODE_CONFLICT");
        var differentCase = await CreateItemAsync(client, input with { ItemCode = "a1" });
        for (var i = 0; i < 2; i++)
            Assert.Equal(HttpStatusCode.OK, (await SendAsync(client, HttpMethod.Patch, Availability(item.Id), new { isAvailable = false })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(client, HttpMethod.Put, $"{Items}/{item.Id}",
            input with { CategoryId = second.Id, ItemCode = " ", AllergenCodes = [], NameZh = "改名", PriceCents = 1 })).StatusCode);
        var saved = (await ReadAsync(client)).Items.Single(value => value.Id == item.Id);
        Assert.False(saved.IsAvailable);
        Assert.Null(saved.ItemCode);
        Assert.Empty(saved.AllergenCodes);
        Assert.True(saved.AllergenReviewed);
        Assert.Equal(second.Id, saved.CategoryId);
        await CreateItemAsync(client, input); // A1 became reusable.
        Assert.Equal(HttpStatusCode.NoContent, (await SendAsync(client, HttpMethod.Delete, $"{Items}/{differentCase.Id}")).StatusCode);
        await CreateItemAsync(client, input with { ItemCode = "a1" }); // Physical deletion also frees the code.
    }

    [Fact]
    public async Task Availability_LegacyUnreviewedItem_RequiresOwnerReviewBeforeRestoring()
    {
        var owner = await SeedAsync();
        using var host = new AccountTestHost(database);
        using var client = await LoginAsync(host, owner);
        var category = await CreateCategoryAsync(client);
        var item = await CreateItemAsync(client, ValidItem(category.Id));
        await using (var context = database.CreateContext())
            await context.MenuItems.Where(value => value.Id == item.Id)
                .ExecuteUpdateAsync(update => update.SetProperty(value => value.AllergenReviewed, false));
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(client, HttpMethod.Patch, Availability(item.Id), new { isAvailable = false })).StatusCode);
        await AssertErrorAsync(await SendAsync(client, HttpMethod.Patch, Availability(item.Id), new { isAvailable = true }), HttpStatusCode.Conflict, "ALLERGEN_REVIEW_REQUIRED");
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(client, HttpMethod.Put, $"{Items}/{item.Id}", ValidItem(category.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(client, HttpMethod.Patch, Availability(item.Id), new { isAvailable = true })).StatusCode);
    }

    [Fact]
    public async Task Languages_ContentChangesAndSoldOutItems_NeverChangePreference()
    {
        using var host = new AccountTestHost(database);
        using var client = await LoginAsync(host, await SeedAsync());
        var category = await CreateCategoryAsync(client, new(null, "Piatti", "Dishes"));
        var input = ValidItem(category.Id) with { NameIt = "Riso" };
        var item = await CreateItemAsync(client, input);
        Assert.Equal("it", (await ReadAsync(client)).DefaultLanguage);
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(client, HttpMethod.Patch, Availability(item.Id), new { isAvailable = false })).StatusCode);
        Assert.Equal(new[] { "zh", "it", "en" }, (await ReadAsync(client)).AvailableLanguages);
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(client, HttpMethod.Put, $"{Categories}/{category.Id}", new CategoryInput(null, null, "Dishes"))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(client, HttpMethod.Put, $"{Items}/{item.Id}", input with { NameIt = null })).StatusCode);
        var withoutItalian = await ReadAsync(client);
        Assert.Equal("it", withoutItalian.DefaultLanguage);
        Assert.Equal(new[] { "zh", "en" }, withoutItalian.AvailableLanguages);
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(client, HttpMethod.Put, $"{Items}/{item.Id}", input)).StatusCode);
        Assert.Contains("it", (await ReadAsync(client)).AvailableLanguages);
        Assert.Equal("it", (await ReadAsync(client)).DefaultLanguage);
        Assert.Equal(HttpStatusCode.NoContent, (await SendAsync(client, HttpMethod.Delete, $"{Items}/{item.Id}")).StatusCode);
        Assert.Equal("it", (await ReadAsync(client)).DefaultLanguage);
        Assert.Equal(new[] { "en" }, (await ReadAsync(client)).AvailableLanguages);
        Assert.Equal(HttpStatusCode.NoContent, (await SendAsync(client, HttpMethod.Delete, $"{Categories}/{category.Id}")).StatusCode);
        Assert.Equal("it", (await ReadAsync(client)).DefaultLanguage);
        Assert.Empty((await ReadAsync(client)).AvailableLanguages);
        await CreateCategoryAsync(client, new(null, "Piatti", null));
        Assert.Equal("it", (await ReadAsync(client)).DefaultLanguage);
        Assert.Equal(new[] { "it" }, (await ReadAsync(client)).AvailableLanguages);
    }

    [Fact]
    public async Task DefaultLanguage_EmptyOrUntranslatedMenu_AcceptsAnySupportedPreference()
    {
        using var host = new AccountTestHost(database);
        using var client = await LoginAsync(host, await SeedAsync());
        foreach (var language in new[] { "zh", "it", "en" })
        {
            var response = await SendAsync(client, HttpMethod.Patch, DefaultLanguage, new { defaultLanguage = language });
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Single(body.EnumerateObject());
            Assert.Equal(language, body.GetProperty("defaultLanguage").GetString());
            var empty = await ReadAsync(client);
            Assert.Equal(language, empty.DefaultLanguage);
            Assert.Empty(empty.AvailableLanguages);
        }
        await CreateCategoryAsync(client); // Only Chinese content, yet English remains the preference.
        Assert.Equal("en", (await ReadAsync(client)).DefaultLanguage);
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(client, HttpMethod.Patch, DefaultLanguage, new { defaultLanguage = "it" })).StatusCode);
        Assert.Equal(new[] { "zh" }, (await ReadAsync(client)).AvailableLanguages);
        foreach (var invalid in new string?[] { "fr", "IT", " it ", "", null })
        {
            var response = await SendAsync(client, HttpMethod.Patch, DefaultLanguage, new { defaultLanguage = invalid });
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            var error = (await response.Content.ReadFromJsonAsync<ApiError>())!;
            Assert.Equal("VALIDATION_FAILED", error.Code);
            Assert.NotEmpty(error.Errors!["defaultLanguage"]);
            Assert.Equal("it", (await ReadAsync(client)).DefaultLanguage);
        }
        await AssertErrorAsync(await SendAsync(client, HttpMethod.Patch, DefaultLanguage, new { defaultLanguage = "en" }, csrf: false),
            HttpStatusCode.BadRequest, "CSRF_VALIDATION_FAILED");
    }

    [Fact]
    public async Task ConcurrentWrites_DuplicateCodeContentAvailabilityAndLanguage_RemainConsistent()
    {
        var user = await SeedAsync();
        using var host = new AccountTestHost(database);
        using var first = await LoginAsync(host, user);
        using var second = await LoginAsync(host, await SeedAsync(RestaurantUserRole.Staff, user.RestaurantId));
        using var otherOwner = await LoginAsync(host, user);
        var category = await CreateCategoryAsync(first);
        var input = ValidItem(category.Id) with { ItemCode = "ONLY" };
        var creates = await Task.WhenAll(SendAsync(first, HttpMethod.Post, Items, input), SendAsync(otherOwner, HttpMethod.Post, Items, input));
        Assert.Single(creates, response => response.StatusCode == HttpStatusCode.Created);
        await AssertErrorAsync(Assert.Single(creates, response => response.StatusCode == HttpStatusCode.Conflict), HttpStatusCode.Conflict, "ITEM_CODE_CONFLICT");
        var item = Assert.Single((await ReadAsync(first)).Items);
        var results = await Task.WhenAll(
            SendAsync(first, HttpMethod.Put, $"{Items}/{item.Id}", input with { NameZh = null, NameIt = "Riso", PriceCents = 2345 }),
            SendAsync(second, HttpMethod.Patch, Availability(item.Id), new { isAvailable = false }),
            SendAsync(otherOwner, HttpMethod.Put, $"{Categories}/{category.Id}", new CategoryInput(null, null, "Dishes")));
        Assert.All(results, response => Assert.Equal(HttpStatusCode.OK, response.StatusCode));
        var menu = await ReadAsync(first);
        Assert.Equal("it", menu.DefaultLanguage);
        Assert.Equal(new[] { "it", "en" }, menu.AvailableLanguages);
        Assert.False(Assert.Single(menu.Items).IsAvailable);
        Assert.Equal(2345, menu.Items[0].PriceCents);
        Assert.Equal("Riso", menu.Items[0].NameIt);
    }

    [Fact]
    public async Task DeleteItem_WithHistoricalOrder_PreservesSnapshotsAndPreference()
    {
        var user = await SeedAsync();
        using var host = new AccountTestHost(database);
        using var client = await LoginAsync(host, user);
        var category = await CreateCategoryAsync(client, new(null, "Piatti", null));
        var item = await CreateItemAsync(client, ValidItem(category.Id));
        await SendAsync(client, HttpMethod.Patch, DefaultLanguage, new { defaultLanguage = "zh" });
        Guid lineId;
        await using (var context = database.CreateContext())
        {
            var session = new DiningSession
            {
                RestaurantId = user.RestaurantId, Status = DiningSessionStatus.Closed, TableLabelSnapshot = "1",
                OpenedAt = DateTime.UtcNow.AddHours(-1), ClosedAt = DateTime.UtcNow, CloseReason = SessionCloseReason.Paid,
                ClosedTotalCents = 2500
            };
            var order = new Order { RestaurantId = user.RestaurantId, DiningSession = session,
                ClientRequestId = Guid.NewGuid(), DefaultLanguageSnapshot = "zh", TotalAmountCents = 2500 };
            var line = new OrderItem { RestaurantId = user.RestaurantId, Order = order, MenuItemId = item.Id,
                NameZhSnapshot = item.NameZh, AllergenCodesSnapshot = ["GLUTEN", "SOY"], UnitPriceCents = 1250, Quantity = 2 };
            context.OrderItems.Add(line);
            await context.SaveChangesAsync();
            lineId = line.Id;
        }
        await SendAsync(client, HttpMethod.Put, $"{Items}/{item.Id}", ValidItem(category.Id) with { PriceCents = 9876, NameZh = "改名", AllergenCodes = [] });
        Assert.Equal(HttpStatusCode.NoContent, (await SendAsync(client, HttpMethod.Delete, $"{Items}/{item.Id}")).StatusCode);
        await using var read = database.CreateContext();
        var saved = await read.OrderItems.Include(value => value.Order).SingleAsync(value => value.Id == lineId);
        Assert.Null(saved.MenuItemId);
        Assert.Equal(item.NameZh, saved.NameZhSnapshot);
        Assert.Equal(new[] { "GLUTEN", "SOY" }, saved.AllergenCodesSnapshot);
        Assert.Equal(1250, saved.UnitPriceCents);
        Assert.Equal(2500, saved.Order.TotalAmountCents);
        Assert.Equal(user.RestaurantId, saved.RestaurantId);
        Assert.Equal("zh", (await ReadAsync(client)).DefaultLanguage);
    }

    [Fact]
    public async Task DeleteCategory_ConcurrentItemCreation_NeverLeavesAnOrphan()
    {
        var user = await SeedAsync();
        using var host = new AccountTestHost(database);
        using var first = await LoginAsync(host, user);
        using var second = await LoginAsync(host, user);
        var category = await CreateCategoryAsync(first);
        var results = await Task.WhenAll(
            SendAsync(first, HttpMethod.Delete, $"{Categories}/{category.Id}"),
            SendAsync(second, HttpMethod.Post, Items, ValidItem(category.Id)));
        var menu = await ReadAsync(first);
        if (results[0].StatusCode == HttpStatusCode.NoContent)
        {
            await AssertErrorAsync(results[1], HttpStatusCode.NotFound, "MENU_RESOURCE_NOT_FOUND");
            Assert.Empty(menu.Categories);
            Assert.Empty(menu.Items);
        }
        else
        {
            await AssertErrorAsync(results[0], HttpStatusCode.Conflict, "CATEGORY_NOT_EMPTY");
            Assert.Equal(HttpStatusCode.Created, results[1].StatusCode);
            Assert.Equal(Assert.Single(menu.Categories).Id, Assert.Single(menu.Items).CategoryId);
        }
    }

    [Fact]
    public async Task DeleteItem_FailureAfterDetachingHistory_RollsBackItemAndReference()
    {
        var user = await SeedAsync();
        using var host = new AccountTestHost(database);
        using var client = await LoginAsync(host, user);
        var category = await CreateCategoryAsync(client);
        var item = await CreateItemAsync(client, ValidItem(category.Id));
        Guid lineId;
        await using (var seed = database.CreateContext())
        {
            var session = new DiningSession
            {
                RestaurantId = user.RestaurantId, Status = DiningSessionStatus.Closed, TableLabelSnapshot = "1",
                OpenedAt = DateTime.UtcNow.AddHours(-1), ClosedAt = DateTime.UtcNow,
                CloseReason = SessionCloseReason.Paid, ClosedTotalCents = 1250
            };
            var order = new Order { RestaurantId = user.RestaurantId, DiningSession = session,
                ClientRequestId = Guid.NewGuid(), DefaultLanguageSnapshot = "it", TotalAmountCents = 1250 };
            var line = new OrderItem { RestaurantId = user.RestaurantId, Order = order, MenuItemId = item.Id,
                NameZhSnapshot = item.NameZh, AllergenCodesSnapshot = item.AllergenCodes, UnitPriceCents = 1250, Quantity = 1 };
            seed.OrderItems.Add(line);
            await seed.SaveChangesAsync();
            lineId = line.Id;
        }
        var failure = new FailMenuDeleteInterceptor();
        await using (var context = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(database.ConnectionString).AddInterceptors(failure).Options))
            await Assert.ThrowsAsync<InjectedDeleteException>(() =>
                new CatalogDeletionService(context).DeleteMenuItemAsync(user.RestaurantId, item.Id));
        Assert.True(failure.DetachmentCompleted);
        Assert.Equal(item.Id, Assert.Single((await ReadAsync(client)).Items).Id);
        await using var read = database.CreateContext();
        var saved = await read.OrderItems.Include(value => value.Order).SingleAsync(value => value.Id == lineId);
        Assert.Equal(item.Id, saved.MenuItemId);
        Assert.Equal(item.NameZh, saved.NameZhSnapshot);
        Assert.Equal(item.AllergenCodes, saved.AllergenCodesSnapshot);
        Assert.Equal(1250, saved.Order.TotalAmountCents);
    }

    [Fact]
    public async Task DeleteItem_ConcurrentEdit_ReturnsSuccessOrNotFoundWithoutLosingHistoryRules()
    {
        var user = await SeedAsync();
        using var host = new AccountTestHost(database);
        using var first = await LoginAsync(host, user);
        using var second = await LoginAsync(host, user);
        var category = await CreateCategoryAsync(first);
        var item = await CreateItemAsync(first, ValidItem(category.Id));
        var results = await Task.WhenAll(
            SendAsync(first, HttpMethod.Delete, $"{Items}/{item.Id}"),
            SendAsync(second, HttpMethod.Put, $"{Items}/{item.Id}", ValidItem(category.Id) with { NameIt = "Riso", PriceCents = 2345 }));
        Assert.Equal(HttpStatusCode.NoContent, results[0].StatusCode);
        if (results[1].StatusCode != HttpStatusCode.OK)
            await AssertErrorAsync(results[1], HttpStatusCode.NotFound, "MENU_RESOURCE_NOT_FOUND");
        Assert.Empty((await ReadAsync(first)).Items);
        Assert.Equal("it", (await ReadAsync(first)).DefaultLanguage);
    }

    [Fact]
    public async Task DefaultLanguage_ConcurrentContentWrite_PreservesExplicitChoice()
    {
        var user = await SeedAsync();
        using var host = new AccountTestHost(database);
        using var first = await LoginAsync(host, user);
        using var second = await LoginAsync(host, user);
        var category = await CreateCategoryAsync(first);
        var results = await Task.WhenAll(
            SendAsync(first, HttpMethod.Patch, DefaultLanguage, new { defaultLanguage = "en" }),
            SendAsync(second, HttpMethod.Put, $"{Categories}/{category.Id}", new CategoryInput("新名称", null, null)));
        Assert.All(results, response => Assert.Equal(HttpStatusCode.OK, response.StatusCode));
        var menu = await ReadAsync(first);
        Assert.Equal("en", menu.DefaultLanguage);
        Assert.Equal(new[] { "zh" }, menu.AvailableLanguages);
        Assert.Equal("新名称", Assert.Single(menu.Categories).NameZh);
    }

    private sealed class InjectedDeleteException : Exception { }

    // Test-only fault injection: the UPDATE really ran inside the service's own transaction.
    private sealed class FailMenuDeleteInterceptor : DbCommandInterceptor
    {
        public bool DetachmentCompleted { get; private set; }

        public override ValueTask<int> NonQueryExecutedAsync(DbCommand command, CommandExecutedEventData eventData,
            int result, CancellationToken cancellationToken = default)
        {
            if (command.CommandText.StartsWith("UPDATE", StringComparison.OrdinalIgnoreCase) &&
                command.CommandText.Contains("order_items") && result == 1) DetachmentCompleted = true;
            return ValueTask.FromResult(result);
        }

        public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(DbCommand command, CommandEventData eventData,
            InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (command.CommandText.StartsWith("DELETE", StringComparison.OrdinalIgnoreCase) &&
                command.CommandText.Contains("menu_items")) throw new InjectedDeleteException();
            return ValueTask.FromResult(result);
        }
    }

    [Fact]
    public async Task ItemImage_OwnerUpload_ServesUprightSquareWebpWithImmutableCache()
    {
        using var host = new AccountTestHost(database);
        var ownerUser = await SeedAsync();
        using var owner = await LoginAsync(host, ownerUser);
        var item = await CreateItemAsync(owner, ValidItem((await CreateCategoryAsync(owner)).Id));
        var token = $"menu-image-{Guid.NewGuid():N}";
        await using (var context = database.CreateContext())
        {
            context.RestaurantTables.Add(new RestaurantTable { RestaurantId = ownerUser.RestaurantId, TableLabel = "T1", QrToken = token });
            await context.SaveChangesAsync();
        }
        // Stored sideways: EXIF orientation 6 turns the red left half into the top half of the upright photo.
        var upload = await UploadAsync(owner, item.Id, Photo(400, 200, orientation: 6));
        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
        var imageId = (await upload.Content.ReadFromJsonAsync<MenuItemResponse>())!.ImageId;
        Assert.NotNull(imageId);
        Assert.Equal(imageId, (await ReadAsync(owner)).Items.Single().ImageId);
        using var guest = host.Browser();
        var bootstrap = await guest.GetFromJsonAsync<PublicMenuResponse>($"/api/public/qr/{token}/bootstrap");
        Assert.Equal(imageId, bootstrap!.Menu.Items.Single().ImageId);

        var response = await guest.GetAsync(PublicImage(imageId.Value));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("image/webp", response.Content.Headers.ContentType!.MediaType);
        Assert.False(response.Headers.CacheControl!.NoStore);
        Assert.True(response.Headers.CacheControl.Public);
        Assert.Equal(TimeSpan.FromDays(365), response.Headers.CacheControl.MaxAge);
        Assert.Contains("immutable", response.Headers.CacheControl.ToString());
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        var webp = await response.Content.ReadAsByteArrayAsync();
        Assert.Equal("RIFF", Encoding.ASCII.GetString(webp, 0, 4));
        Assert.Equal("WEBP", Encoding.ASCII.GetString(webp, 8, 4));
        Assert.DoesNotContain("EXIF", Encoding.ASCII.GetString(webp));
        using var stored = SKBitmap.Decode(webp);
        Assert.Equal((640, 640), (stored.Width, stored.Height));
        // Ignoring the tag would leave red on the left and blue on the right instead.
        Assert.True(IsRed(stored.GetPixel(560, 80)));
        Assert.False(IsRed(stored.GetPixel(80, 560)));
    }

    [Fact]
    public async Task ItemImage_ReplaceDeleteAndContentSaves_KeepAtMostOneImmutableImage()
    {
        using var host = new AccountTestHost(database);
        using var owner = await LoginAsync(host, await SeedAsync());
        var category = await CreateCategoryAsync(owner);
        var item = await CreateItemAsync(owner, ValidItem(category.Id));
        var first = await UploadImageAsync(owner, item.Id, Photo(300, 300, SKEncodedImageFormat.Png));
        // Content and availability writes never touch the photo.
        var saved = await SendAsync(owner, HttpMethod.Put, $"{Items}/{item.Id}", ValidItem(category.Id) with { NameIt = "Riso" });
        Assert.Equal(first, (await saved.Content.ReadFromJsonAsync<MenuItemResponse>())!.ImageId);
        var sold = await SendAsync(owner, HttpMethod.Patch, Availability(item.Id), new { isAvailable = false });
        Assert.Equal(first, (await sold.Content.ReadFromJsonAsync<MenuItemResponse>())!.ImageId);

        var second = await UploadImageAsync(owner, item.Id, Photo(900, 600));
        Assert.NotEqual(first, second);
        using var guest = host.Browser();
        var replaced = await guest.GetAsync(PublicImage(first));
        await AssertErrorAsync(replaced, HttpStatusCode.NotFound, "MENU_IMAGE_NOT_FOUND");
        Assert.True(replaced.Headers.CacheControl!.NoStore);
        Assert.Equal(HttpStatusCode.OK, (await guest.GetAsync(PublicImage(second))).StatusCode);
        Assert.Equal(1, await ImageCountAsync(item.Id));

        foreach (var _ in Enumerable.Range(0, 2))
        {
            var deleted = await SendAsync(owner, HttpMethod.Delete, ImagePath(item.Id));
            Assert.Equal(HttpStatusCode.OK, deleted.StatusCode);
            Assert.Null((await deleted.Content.ReadFromJsonAsync<MenuItemResponse>())!.ImageId);
        }
        Assert.Null((await ReadAsync(owner)).Items.Single().ImageId);
        await AssertErrorAsync(await guest.GetAsync(PublicImage(second)), HttpStatusCode.NotFound, "MENU_IMAGE_NOT_FOUND");
        Assert.Equal(0, await ImageCountAsync(item.Id));

        var third = await UploadImageAsync(owner, item.Id, Photo(300, 300));
        Assert.Equal(HttpStatusCode.NoContent, (await SendAsync(owner, HttpMethod.Delete, $"{Items}/{item.Id}")).StatusCode);
        Assert.Equal(0, await ImageCountAsync(item.Id));
        await AssertErrorAsync(await guest.GetAsync(PublicImage(third)), HttpStatusCode.NotFound, "MENU_IMAGE_NOT_FOUND");
    }

    [Fact]
    public async Task ItemImage_InvalidRequests_AreRejectedWithoutChangingTheItem()
    {
        using var host = new AccountTestHost(database);
        var ownerUser = await SeedAsync();
        using var owner = await LoginAsync(host, ownerUser);
        using var staff = await LoginAsync(host, await SeedAsync(RestaurantUserRole.Staff, ownerUser.RestaurantId));
        using var other = await LoginAsync(host, await SeedAsync());
        var item = await CreateItemAsync(owner, ValidItem((await CreateCategoryAsync(owner)).Id));
        var photo = Photo(300, 300);
        await AssertErrorAsync(await UploadAsync(staff, item.Id, photo), HttpStatusCode.Forbidden, "FORBIDDEN");
        await AssertErrorAsync(await SendAsync(staff, HttpMethod.Delete, ImagePath(item.Id)), HttpStatusCode.Forbidden, "FORBIDDEN");
        await AssertErrorAsync(await UploadAsync(owner, item.Id, photo, csrf: false), HttpStatusCode.BadRequest, "CSRF_VALIDATION_FAILED");
        await AssertErrorAsync(await UploadAsync(other, item.Id, photo), HttpStatusCode.NotFound, "MENU_RESOURCE_NOT_FOUND");
        await AssertErrorAsync(await SendAsync(other, HttpMethod.Delete, ImagePath(item.Id)), HttpStatusCode.NotFound, "MENU_RESOURCE_NOT_FOUND");
        await AssertErrorAsync(await UploadAsync(owner, Guid.NewGuid(), photo), HttpStatusCode.NotFound, "MENU_RESOURCE_NOT_FOUND");
        byte[] gif = Convert.FromBase64String("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==");
        foreach (var content in new byte[][] { [], "not an image"u8.ToArray(), gif, photo[..(photo.Length / 2)] })
            await AssertErrorAsync(await UploadAsync(owner, item.Id, content), HttpStatusCode.BadRequest, "IMAGE_INVALID");
        await AssertErrorAsync(await UploadAsync(owner, item.Id, new byte[15 * 1024 * 1024 + 1]), HttpStatusCode.RequestEntityTooLarge, "IMAGE_TOO_LARGE");
        Assert.Null((await ReadAsync(owner)).Items.Single().ImageId);
        Assert.Equal(0, await ImageCountAsync(item.Id));
        using var guest = host.Browser();
        await AssertErrorAsync(await guest.GetAsync(PublicImage(Guid.NewGuid())), HttpStatusCode.NotFound, "MENU_IMAGE_NOT_FOUND");
    }

    private async Task<RestaurantUser> SeedAsync(RestaurantUserRole role = RestaurantUserRole.Owner, Guid? restaurantId = null, bool mustChange = false)
    {
        await using var context = database.CreateContext();
        var user = new RestaurantUser { Username = $"menu_{Guid.NewGuid():N}", PasswordHash = "", Role = role, MustChangePassword = mustChange };
        if (restaurantId is { } id) user.RestaurantId = id;
        else user.Restaurant = new Restaurant { Name = "菜单测试餐厅", DefaultLanguage = "it" };
        user.PasswordHash = new PasswordHasher<RestaurantUser>().HashPassword(user, Password);
        context.RestaurantUsers.Add(user);
        await context.SaveChangesAsync();
        return user;
    }

    private static async Task<HttpClient> LoginAsync(AccountTestHost host, RestaurantUser user)
    {
        var client = host.Browser();
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(client, "/api/auth/login", new LoginRequest(user.Username, Password))).StatusCode);
        return client;
    }

    private static async Task<HttpResponseMessage> SendAsync(HttpClient client, HttpMethod method, string path, object? body = null, bool csrf = true)
    {
        using var request = new HttpRequestMessage(method, path);
        if (body is not null) request.Content = JsonContent.Create(body);
        if (csrf) request.Headers.Add("X-CSRF-TOKEN", await CsrfAsync(client));
        return await client.SendAsync(request);
    }

    private static async Task<MenuResponse> ReadAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/staff/menu");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl!.NoStore);
        return (await response.Content.ReadFromJsonAsync<MenuResponse>())!;
    }

    private static async Task<CategoryResponse> CreateCategoryAsync(HttpClient client, CategoryInput? input = null)
    {
        var response = await SendAsync(client, HttpMethod.Post, Categories, input ?? new CategoryInput("分类", null, null));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<CategoryResponse>())!;
    }

    private static async Task<MenuItemResponse> CreateItemAsync(HttpClient client, MenuItemInput input)
    {
        var response = await SendAsync(client, HttpMethod.Post, Items, input);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<MenuItemResponse>())!;
    }

    private static string ImagePath(Guid itemId) => $"{Items}/{itemId}/image";
    private static string PublicImage(Guid imageId) => $"/api/public/menu-images/{imageId}";

    private static async Task<HttpResponseMessage> UploadAsync(HttpClient client, Guid itemId, byte[] content, bool csrf = true)
    {
        using var request = new HttpRequestMessage(HttpMethod.Put, ImagePath(itemId)) { Content = new ByteArrayContent(content) };
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        if (csrf) request.Headers.Add("X-CSRF-TOKEN", await CsrfAsync(client));
        return await client.SendAsync(request);
    }

    private static async Task<Guid> UploadImageAsync(HttpClient client, Guid itemId, byte[] content)
    {
        var response = await UploadAsync(client, itemId, content);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<MenuItemResponse>())!.ImageId!.Value;
    }

    private async Task<int> ImageCountAsync(Guid itemId)
    {
        await using var context = database.CreateContext();
        return await context.MenuItemImages.CountAsync(x => x.MenuItemId == itemId);
    }

    // Left half red, right half blue; a JPEG can carry an EXIF orientation tag.
    private static byte[] Photo(int width, int height, SKEncodedImageFormat format = SKEncodedImageFormat.Jpeg,
        byte? orientation = null)
    {
        using var bitmap = new SKBitmap(width, height);
        using (var canvas = new SKCanvas(bitmap))
        using (var paint = new SKPaint { Color = SKColors.Red })
        {
            canvas.Clear(SKColors.Blue);
            canvas.DrawRect(0, 0, width / 2f, height, paint);
        }
        using var data = bitmap.Encode(format, 95);
        var bytes = data.ToArray();
        if (orientation is not { } value) return bytes;
        // APP1 "Exif" segment with a big-endian TIFF header and a single SHORT tag 0x0112, inserted after SOI.
        byte[] exif = [0xFF, 0xE1, 0, 34, .. "Exif\0\0"u8, .. "MM"u8, 0, 42, 0, 0, 0, 8, 0, 1,
            0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, value, 0, 0, 0, 0, 0, 0];
        return [.. bytes[..2], .. exif, .. bytes[2..]];
    }

    private static bool IsRed(SKColor color) => color.Red > 200 && color.Blue < 80;

    private static string Availability(Guid id) => $"/api/staff/menu-items/{id}/availability";
    private static MenuItemInput ValidItem(Guid categoryId) => new(categoryId, null, "炒饭", null, null,
        null, null, null, 1250, ["GLUTEN", "SOY"], true);
}
