using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
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
        Assert.Equal("zh", (await ReadAsync(client)).DefaultLanguage);
        var updated = await SendAsync(client, HttpMethod.Put, $"{Categories}/{category.Id}", new CategoryInput(null, null, "Rice"));
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        Assert.Equal("en", (await ReadAsync(client)).DefaultLanguage);
        Assert.Equal(HttpStatusCode.NoContent, (await SendAsync(client, HttpMethod.Delete, $"{Categories}/{category.Id}")).StatusCode);
        var after = await ReadAsync(client);
        Assert.Empty(after.Categories);
        Assert.Equal("en", after.DefaultLanguage);
        await AssertErrorAsync(await SendAsync(client, HttpMethod.Patch, DefaultLanguage, new { defaultLanguage = "zh" }), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
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
            "unsafe" => original with { PriceCents = MenuValidation.MaxPriceCents + 1 },
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
        Assert.Equal("zh", menu.DefaultLanguage);
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
    public async Task Languages_ContentChangesAndSoldOutItems_AdjustsAndRetainsDefaults()
    {
        using var host = new AccountTestHost(database);
        using var client = await LoginAsync(host, await SeedAsync());
        var category = await CreateCategoryAsync(client, new(null, "Piatti", "Dishes"));
        var input = ValidItem(category.Id);
        var item = await CreateItemAsync(client, input);
        Assert.Equal("it", (await ReadAsync(client)).DefaultLanguage);
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(client, HttpMethod.Patch, DefaultLanguage, new { defaultLanguage = "zh" })).StatusCode);
        await SendAsync(client, HttpMethod.Patch, Availability(item.Id), new { isAvailable = false });
        Assert.Equal(new[] { "zh", "it", "en" }, (await ReadAsync(client)).AvailableLanguages);
        await SendAsync(client, HttpMethod.Put, $"{Items}/{item.Id}", input with { NameZh = null, NameEn = "Rice" });
        Assert.Equal("it", (await ReadAsync(client)).DefaultLanguage);
        await SendAsync(client, HttpMethod.Put, $"{Categories}/{category.Id}", new CategoryInput(null, null, "Dishes"));
        Assert.Equal("en", (await ReadAsync(client)).DefaultLanguage);
        await AssertErrorAsync(await SendAsync(client, HttpMethod.Patch, DefaultLanguage, new { defaultLanguage = "it" }), HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        await SendAsync(client, HttpMethod.Delete, $"{Items}/{item.Id}");
        await SendAsync(client, HttpMethod.Delete, $"{Categories}/{category.Id}");
        Assert.Equal("en", (await ReadAsync(client)).DefaultLanguage);
        Assert.Empty((await ReadAsync(client)).AvailableLanguages);
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
        Assert.Contains(menu.DefaultLanguage, menu.AvailableLanguages);
        Assert.Equal(new[] { "it", "en" }, menu.AvailableLanguages);
        Assert.False(Assert.Single(menu.Items).IsAvailable);
        Assert.Equal(2345, menu.Items[0].PriceCents);
        Assert.Equal("Riso", menu.Items[0].NameIt);
    }

    [Fact]
    public async Task DeleteItem_WithHistoricalOrder_PreservesSnapshotsAndUpdatesLanguage()
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
        Assert.Equal("it", (await ReadAsync(client)).DefaultLanguage);
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
    public async Task DeleteItem_OuterTransactionRollback_DoesNotCommitDeletion()
    {
        var user = await SeedAsync();
        using var host = new AccountTestHost(database);
        using var client = await LoginAsync(host, user);
        var category = await CreateCategoryAsync(client);
        var item = await CreateItemAsync(client, ValidItem(category.Id));
        await using (var context = database.CreateContext())
        {
            await using var transaction = await context.Database.BeginTransactionAsync();
            Assert.Equal(CatalogDeletionResult.Deleted,
                await new CatalogDeletionService(context).DeleteMenuItemAsync(user.RestaurantId, item.Id));
            Assert.False(await context.MenuItems.AnyAsync(value => value.Id == item.Id));
            await transaction.RollbackAsync();
        }
        Assert.Equal(item.Id, Assert.Single((await ReadAsync(client)).Items).Id);
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

    private static string Availability(Guid id) => $"/api/staff/menu-items/{id}/availability";
    private static MenuItemInput ValidItem(Guid categoryId) => new(categoryId, null, "炒饭", null, null,
        null, null, null, 1250, ["GLUTEN", "SOY"], true);
}
