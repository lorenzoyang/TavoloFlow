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

public sealed class MenuOptionTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    private const string Password = "Option-test-password-123";
    private const string Groups = "/api/owner/menu/option-groups";
    private const string Items = "/api/owner/menu/items";

    private sealed record Seed(
        RestaurantUser Owner,
        RestaurantUser Staff,
        MenuItem Tea,
        MenuItem Juice
    );

    [Fact]
    public async Task SaveGroup_CreateAndEdit_KeepsOptionIdsAvailabilityAndLinks()
    {
        using var host = new AccountTestHost(database);
        var seed = await SeedAsync();
        using var owner = await LoginAsync(host, seed.Owner);
        using var staff = await LoginAsync(host, seed.Staff);

        var created = await CreateGroupAsync(owner, Size([seed.Tea.Id]));
        Assert.Equal(["Media", "Grande"], created.Options.Select(x => x.NameIt));
        Assert.Equal([0L, 100L], created.Options.Select(x => x.PriceDeltaCents));
        Assert.All(created.Options, x => Assert.True(x.IsAvailable));
        var (medium, large) = (created.Options[0], created.Options[1]);

        var soldOut = await SendAsync(
            staff,
            HttpMethod.Patch,
            $"/api/staff/menu-options/{large.Id}/availability",
            new { isAvailable = false }
        );
        Assert.Equal(HttpStatusCode.OK, soldOut.StatusCode);
        Assert.False((await soldOut.Content.ReadFromJsonAsync<OptionResponse>())!.IsAvailable);

        // Reordered, renamed, one added; the sold-out option keeps its id and stays sold out.
        var edited = Size([seed.Tea.Id, seed.Juice.Id]) with
        {
            Options =
            [
                new(large.Id, "大杯", "Grande", "Large", 150, ["MILK"]),
                new(medium.Id, "中杯", "Media", "Regular", 0, []),
                new(null, "超大杯", "Extra", "Extra large", 250, []),
            ],
            MaxSelect = 1,
        };
        var updated = await SendAsync(owner, HttpMethod.Put, $"{Groups}/{created.Id}", edited);
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var group = (await updated.Content.ReadFromJsonAsync<OptionGroupResponse>())!;
        Assert.Equal(created.Id, group.Id);
        Assert.Equal(large.Id, group.Options[0].Id);
        Assert.False(group.Options[0].IsAvailable);
        Assert.Equal(["MILK"], group.Options[0].AllergenCodes);
        Assert.Equal(medium.Id, group.Options[1].Id);
        Assert.True(group.Options[2].IsAvailable);

        // Leaving an option out removes it.
        var trimmed = edited with
        {
            Options = [edited.Options![0], edited.Options[2]! with { Id = group.Options[2].Id }],
        };
        Assert.Equal(
            HttpStatusCode.OK,
            (await SendAsync(owner, HttpMethod.Put, $"{Groups}/{created.Id}", trimmed)).StatusCode
        );
        var menu = await ReadMenuAsync(owner);
        var read = Assert.Single(menu.OptionGroups);
        Assert.Equal([large.Id, group.Options[2].Id], read.Options.Select(x => x.Id));
        Assert.All(menu.Items, item => Assert.Equal([created.Id], item.OptionGroupIds));
        await using var db = database.CreateContext();
        Assert.False(await db.MenuOptions.AnyAsync(x => x.Id == medium.Id));
    }

    [Theory]
    [InlineData("noName")]
    [InlineData("noOptions")]
    [InlineData("minAboveMax")]
    [InlineData("maxAboveOptions")]
    [InlineData("negativeDelta")]
    [InlineData("badAllergen")]
    [InlineData("unreviewed")]
    [InlineData("emptyOptionId")]
    [InlineData("duplicateOption")]
    [InlineData("missingDishes")]
    public async Task SaveGroup_InvalidInput_RejectsWithoutWriting(string scenario)
    {
        using var host = new AccountTestHost(database);
        var seed = await SeedAsync();
        using var owner = await LoginAsync(host, seed.Owner);
        var valid = Size([seed.Tea.Id]);
        var (medium, large) = (valid.Options![0]!, valid.Options[1]!);
        var existing = Guid.NewGuid();
        var input = scenario switch
        {
            "noName" => valid with { NameZh = " ", NameIt = null, NameEn = null },
            "noOptions" => valid with { Options = [] },
            "minAboveMax" => valid with { MinSelect = 2, MaxSelect = 1 },
            "maxAboveOptions" => valid with { MaxSelect = 3 },
            "negativeDelta" => valid with
            {
                Options = [medium, large with { PriceDeltaCents = -1 }],
            },
            "badAllergen" => valid with
            {
                Options = [medium, large with { AllergenCodes = ["SUGAR"] }],
            },
            "unreviewed" => valid with { AllergenReviewed = false },
            "emptyOptionId" => valid with { Options = [medium with { Id = Guid.Empty }, large] },
            "duplicateOption" => valid with
            {
                Options = [medium with { Id = existing }, large with { Id = existing }],
            },
            _ => valid with { MenuItemIds = null },
        };
        await AssertErrorAsync(
            await SendAsync(owner, HttpMethod.Post, Groups, input),
            HttpStatusCode.BadRequest,
            "VALIDATION_FAILED"
        );
        await using var db = database.CreateContext();
        Assert.False(
            await db.MenuOptionGroups.AnyAsync(x => x.RestaurantId == seed.Owner.RestaurantId)
        );
    }

    [Fact]
    public async Task SaveGroup_ForeignIdsAndDishLimit_RejectsAndRollsBack()
    {
        using var host = new AccountTestHost(database);
        var seed = await SeedAsync();
        var other = await SeedAsync();
        using var owner = await LoginAsync(host, seed.Owner);
        using var stranger = await LoginAsync(host, other.Owner);
        var group = await CreateGroupAsync(owner, Size([seed.Tea.Id]));

        await AssertErrorAsync(
            await SendAsync(owner, HttpMethod.Post, Groups, Size([other.Tea.Id])),
            HttpStatusCode.NotFound,
            "MENU_RESOURCE_NOT_FOUND"
        );
        var foreignOption = Size([seed.Tea.Id]) with
        {
            Options = [new(Guid.NewGuid(), "中杯", null, null, 0, [])],
        };
        await AssertErrorAsync(
            await SendAsync(owner, HttpMethod.Put, $"{Groups}/{group.Id}", foreignOption),
            HttpStatusCode.NotFound,
            "MENU_RESOURCE_NOT_FOUND"
        );
        foreach (
            var (method, path, body) in new (HttpMethod, string, object?)[]
            {
                (HttpMethod.Put, $"{Groups}/{group.Id}", Size([other.Tea.Id])),
                (HttpMethod.Delete, $"{Groups}/{group.Id}", null),
                (
                    HttpMethod.Patch,
                    $"/api/staff/menu-options/{group.Options[0].Id}/availability",
                    new { isAvailable = false }
                ),
            }
        )
            await AssertErrorAsync(
                await SendAsync(stranger, method, path, body),
                HttpStatusCode.NotFound,
                "MENU_RESOURCE_NOT_FOUND"
            );

        for (var i = 1; i < MenuValidation.MaxGroupsPerItem; i++)
            await CreateGroupAsync(owner, Size([seed.Tea.Id]));
        await AssertErrorAsync(
            await SendAsync(owner, HttpMethod.Post, Groups, Size([seed.Tea.Id])),
            HttpStatusCode.BadRequest,
            "VALIDATION_FAILED"
        );
        var menu = await ReadMenuAsync(owner);
        Assert.Equal(MenuValidation.MaxGroupsPerItem, menu.OptionGroups.Length);
        Assert.Equal(
            MenuValidation.MaxGroupsPerItem,
            menu.Items.Single(x => x.Id == seed.Tea.Id).OptionGroupIds.Length
        );
    }

    [Fact]
    public async Task Roles_Staff_TogglesOptionsButCannotEditGroups()
    {
        using var host = new AccountTestHost(database);
        var seed = await SeedAsync();
        using var owner = await LoginAsync(host, seed.Owner);
        using var staff = await LoginAsync(host, seed.Staff);
        var group = await CreateGroupAsync(owner, Size([seed.Tea.Id]));
        foreach (
            var (method, path, body) in new (HttpMethod, string, object?)[]
            {
                (HttpMethod.Post, Groups, Size([seed.Tea.Id])),
                (HttpMethod.Put, $"{Groups}/{group.Id}", Size([seed.Tea.Id])),
                (HttpMethod.Delete, $"{Groups}/{group.Id}", null),
                (HttpMethod.Put, $"{Groups}/order", new OptionGroupOrderInput([group.Id])),
            }
        )
            Assert.Equal(
                HttpStatusCode.Forbidden,
                (await SendAsync(staff, method, path, body)).StatusCode
            );
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await SendAsync(
                    staff,
                    HttpMethod.Patch,
                    $"/api/staff/menu-options/{group.Options[0].Id}/availability",
                    new { isAvailable = false }
                )
            ).StatusCode
        );
        Assert.False((await ReadMenuAsync(staff)).OptionGroups[0].Options[0].IsAvailable);
    }

    [Fact]
    public async Task ReorderGroups_ExactPermutation_ReordersDishesAndRejectsStaleLists()
    {
        using var host = new AccountTestHost(database);
        var seed = await SeedAsync();
        using var owner = await LoginAsync(host, seed.Owner);
        var a = await CreateGroupAsync(owner, Size([seed.Tea.Id]));
        var b = await CreateGroupAsync(owner, Size([seed.Tea.Id]));
        var c = await CreateGroupAsync(owner, Size([seed.Tea.Id, seed.Juice.Id]));
        Assert.Equal(
            [a.Id, b.Id, c.Id],
            (await ReadMenuAsync(owner)).Items.Single(x => x.Id == seed.Tea.Id).OptionGroupIds
        );

        Guid[] order = [c.Id, a.Id, b.Id];
        for (var attempt = 0; attempt < 2; attempt++)
            Assert.Equal(
                HttpStatusCode.NoContent,
                (
                    await SendAsync(
                        owner,
                        HttpMethod.Put,
                        $"{Groups}/order",
                        new OptionGroupOrderInput(order)
                    )
                ).StatusCode
            );
        var menu = await ReadMenuAsync(owner);
        Assert.Equal(order, menu.OptionGroups.Select(x => x.Id));
        Assert.Equal(order, menu.Items.Single(x => x.Id == seed.Tea.Id).OptionGroupIds);
        Assert.Equal([c.Id], menu.Items.Single(x => x.Id == seed.Juice.Id).OptionGroupIds);

        foreach (
            Guid[]? stale in new Guid[]?[]
            {
                [a.Id, b.Id],
                [a.Id, b.Id, c.Id, Guid.NewGuid()],
                [a.Id, a.Id, b.Id],
                null,
            }
        )
            await AssertErrorAsync(
                await SendAsync(
                    owner,
                    HttpMethod.Put,
                    $"{Groups}/order",
                    new OptionGroupOrderInput(stale)
                ),
                HttpStatusCode.Conflict,
                "OPTION_GROUPS_CHANGED"
            );
        Assert.Equal(order, (await ReadMenuAsync(owner)).OptionGroups.Select(x => x.Id));
    }

    [Fact]
    public async Task SaveItem_OptionGroupIds_ReplacesLinksAndRequiresAList()
    {
        using var host = new AccountTestHost(database);
        var seed = await SeedAsync();
        var other = await SeedAsync();
        using var owner = await LoginAsync(host, seed.Owner);
        using var stranger = await LoginAsync(host, other.Owner);
        var size = await CreateGroupAsync(owner, Size([seed.Tea.Id]));
        var sugar = await CreateGroupAsync(owner, Size([]));
        var foreign = await CreateGroupAsync(stranger, Size([other.Tea.Id]));

        // The list is required: an empty array means none, a missing one is rejected.
        await AssertErrorAsync(
            await SendAsync(owner, HttpMethod.Put, $"{Items}/{seed.Tea.Id}", Item(seed.Tea, null)),
            HttpStatusCode.BadRequest,
            "VALIDATION_FAILED"
        );

        // A new dish gets its groups in the same request, listed in the restaurant-wide order.
        var created = await SendAsync(
            owner,
            HttpMethod.Post,
            Items,
            Item(seed.Tea, [sugar.Id, size.Id, sugar.Id]) with
            {
                NameZh = "新奶茶",
            }
        );
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var dish = (await created.Content.ReadFromJsonAsync<MenuItemResponse>())!;
        Assert.Equal([size.Id, sugar.Id], dish.OptionGroupIds);

        var cleared = await SendAsync(
            owner,
            HttpMethod.Put,
            $"{Items}/{dish.Id}",
            Item(seed.Tea, [])
        );
        Assert.Empty((await cleared.Content.ReadFromJsonAsync<MenuItemResponse>())!.OptionGroupIds);

        await AssertErrorAsync(
            await SendAsync(
                owner,
                HttpMethod.Put,
                $"{Items}/{seed.Tea.Id}",
                Item(seed.Tea, [foreign.Id])
            ),
            HttpStatusCode.NotFound,
            "MENU_RESOURCE_NOT_FOUND"
        );
        await AssertErrorAsync(
            await SendAsync(
                owner,
                HttpMethod.Put,
                $"{Items}/{seed.Tea.Id}",
                Item(
                    seed.Tea,
                    Enumerable
                        .Range(0, MenuValidation.MaxGroupsPerItem + 1)
                        .Select(_ => Guid.NewGuid())
                        .ToArray()
                )
            ),
            HttpStatusCode.BadRequest,
            "VALIDATION_FAILED"
        );
        Assert.Equal(
            [size.Id],
            (await ReadMenuAsync(owner)).Items.Single(x => x.Id == seed.Tea.Id).OptionGroupIds
        );
    }

    [Fact]
    public async Task Delete_GroupDishOrRestaurant_CascadesOptionsAndLinks()
    {
        using var host = new AccountTestHost(database);
        var seed = await SeedAsync();
        using var owner = await LoginAsync(host, seed.Owner);
        var size = await CreateGroupAsync(owner, Size([seed.Tea.Id, seed.Juice.Id]));
        var toppings = await CreateGroupAsync(owner, Size([seed.Tea.Id]));

        Assert.Equal(
            HttpStatusCode.NoContent,
            (await SendAsync(owner, HttpMethod.Delete, $"{Groups}/{toppings.Id}")).StatusCode
        );
        await AssertErrorAsync(
            await SendAsync(owner, HttpMethod.Delete, $"{Groups}/{toppings.Id}"),
            HttpStatusCode.NotFound,
            "MENU_RESOURCE_NOT_FOUND"
        );
        await using var db = database.CreateContext();
        Assert.False(await db.MenuOptions.AnyAsync(x => x.GroupId == toppings.Id));
        Assert.False(await db.MenuItemOptionGroups.AnyAsync(x => x.GroupId == toppings.Id));

        Assert.Equal(
            CatalogDeletionResult.Deleted,
            await new CatalogDeletionService(db).DeleteMenuItemAsync(
                seed.Owner.RestaurantId,
                seed.Tea.Id
            )
        );
        Assert.Equal(
            [seed.Juice.Id],
            await db
                .MenuItemOptionGroups.Where(x => x.GroupId == size.Id)
                .Select(x => x.MenuItemId)
                .ToArrayAsync()
        );

        await db.Restaurants.Where(x => x.Id == seed.Owner.RestaurantId).ExecuteDeleteAsync();
        Assert.False(await db.MenuOptionGroups.AnyAsync(x => x.Id == size.Id));
        Assert.False(await db.MenuOptions.AnyAsync(x => x.GroupId == size.Id));
        Assert.False(await db.MenuItemOptionGroups.AnyAsync(x => x.GroupId == size.Id));
    }

    [Fact]
    public async Task PublicBootstrap_DishWithOptions_ReturnsGroupsInOrder()
    {
        using var host = new AccountTestHost(database);
        var seed = await SeedAsync();
        using var owner = await LoginAsync(host, seed.Owner);
        var size = await CreateGroupAsync(owner, Size([seed.Tea.Id]));
        await using var db = database.CreateContext();
        var table = new RestaurantTable
        {
            RestaurantId = seed.Owner.RestaurantId,
            TableLabel = "1",
            QrToken = Guid.NewGuid().ToString("N"),
        };
        db.RestaurantTables.Add(table);
        await db.SaveChangesAsync();

        using var anonymous = host.Browser();
        var menu = (
            await anonymous.GetFromJsonAsync<PublicMenuResponse>(
                $"/api/public/qr/{table.QrToken}/bootstrap"
            )
        )!.Menu;
        var group = Assert.Single(menu.OptionGroups);
        Assert.Equal((1, 1), (group.MinSelect, group.MaxSelect));
        Assert.Equal(size.Options.Select(x => x.Id), group.Options.Select(x => x.Id));
        Assert.Equal([size.Id], menu.Items.Single(x => x.Id == seed.Tea.Id).OptionGroupIds);
        Assert.Empty(menu.Items.Single(x => x.Id == seed.Juice.Id).OptionGroupIds);
    }

    [Theory]
    [InlineData("minAboveMax")]
    [InlineData("zeroMax")]
    [InlineData("negativeDelta")]
    [InlineData("blankName")]
    [InlineData("foreignGroup")]
    public async Task Database_InvalidRows_AreRejectedByConstraints(string scenario)
    {
        var seed = await SeedAsync();
        var other = await SeedAsync();
        await using var db = database.CreateContext();
        var group = new MenuOptionGroup
        {
            RestaurantId = seed.Owner.RestaurantId,
            NameZh = "杯型",
            MinSelect = 1,
            MaxSelect = 1,
        };
        db.MenuOptionGroups.Add(group);
        await db.SaveChangesAsync();
        switch (scenario)
        {
            case "minAboveMax":
                group.MinSelect = 2;
                break;
            case "zeroMax":
                group.MinSelect = 0;
                group.MaxSelect = 0;
                break;
            case "blankName":
                group.NameZh = "  ";
                break;
            case "negativeDelta":
                db.MenuOptions.Add(
                    new MenuOption
                    {
                        RestaurantId = seed.Owner.RestaurantId,
                        GroupId = group.Id,
                        NameZh = "大杯",
                        PriceDeltaCents = -1,
                    }
                );
                break;
            default:
                // The link's tenant must match both the dish's and the group's.
                db.MenuItemOptionGroups.Add(
                    new MenuItemOptionGroup
                    {
                        MenuItemId = other.Tea.Id,
                        GroupId = group.Id,
                        RestaurantId = other.Owner.RestaurantId,
                    }
                );
                break;
        }
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    private static OptionGroupInput Size(Guid[] menuItemIds) =>
        new(
            "杯型",
            "Formato",
            "Size",
            1,
            1,
            [
                new(null, "中杯", "Media", "Regular", 0, []),
                new(null, "大杯", "Grande", "Large", 100, []),
            ],
            menuItemIds,
            true
        );

    private static MenuItemInput Item(MenuItem item, Guid[]? optionGroupIds) =>
        new(
            item.CategoryId,
            null,
            item.NameZh,
            item.NameIt,
            item.NameEn,
            null,
            null,
            null,
            item.PriceCents,
            [],
            true,
            optionGroupIds
        );

    private static async Task<OptionGroupResponse> CreateGroupAsync(
        HttpClient client,
        OptionGroupInput input
    )
    {
        var response = await SendAsync(client, HttpMethod.Post, Groups, input);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<OptionGroupResponse>())!;
    }

    private async Task<Seed> SeedAsync()
    {
        await using var db = database.CreateContext();
        var restaurant = new Restaurant { Name = "奶茶测试", DefaultLanguage = "zh" };
        var category = new MenuCategory { Restaurant = restaurant, NameZh = "饮品" };
        MenuItem Drink(string name) =>
            new()
            {
                Restaurant = restaurant,
                Category = category,
                NameZh = name,
                PriceCents = 500,
                AllergenReviewed = true,
            };
        var tea = Drink("奶茶");
        var juice = Drink("果茶");
        RestaurantUser User(RestaurantUserRole role)
        {
            var user = new RestaurantUser
            {
                Restaurant = restaurant,
                Username = $"option_{Guid.NewGuid():N}",
                PasswordHash = "",
                Role = role,
                MustChangePassword = false,
            };
            user.PasswordHash = new PasswordHasher<RestaurantUser>().HashPassword(user, Password);
            return user;
        }
        var owner = User(RestaurantUserRole.Owner);
        var staff = User(RestaurantUserRole.Staff);
        db.AddRange(owner, staff, tea, juice);
        await db.SaveChangesAsync();
        return new(owner, staff, tea, juice);
    }

    private static async Task<HttpClient> LoginAsync(AccountTestHost host, RestaurantUser user)
    {
        var client = host.Browser();
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await PostAsync(
                    client,
                    "/api/auth/login",
                    new LoginRequest(user.Username, Password)
                )
            ).StatusCode
        );
        return client;
    }

    private static async Task<MenuResponse> ReadMenuAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<MenuResponse>("/api/staff/menu"))!;

    private static async Task<HttpResponseMessage> SendAsync(
        HttpClient client,
        HttpMethod method,
        string path,
        object? body = null
    )
    {
        using var request = new HttpRequestMessage(method, path);
        if (body is not null)
            request.Content = JsonContent.Create(body, body.GetType());
        request.Headers.Add("X-CSRF-TOKEN", await CsrfAsync(client));
        return await client.SendAsync(request);
    }
}
