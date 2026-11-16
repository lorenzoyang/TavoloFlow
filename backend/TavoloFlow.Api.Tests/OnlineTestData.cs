using System.Data.Common;
using System.Net;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Options;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Online;
using TavoloFlow.Api.Push;
using static TavoloFlow.Api.Tests.AccountTestHost;

namespace TavoloFlow.Api.Tests;

// Online requests and accepted online sessions written straight to the database, for tests that need
// them before (or without) the submission and acceptance endpoints.
internal static class OnlineTestData
{
    // For services constructed outside the host: push is off, so nothing is queued.
    public static readonly IOptions<OnlineRateLimitOptions> SubmissionLimits = Options.Create(
        new OnlineRateLimitOptions()
    );

    public static OnlineSubmissionSource Source() => new(Guid.NewGuid().ToString("N"), "192.0.2.1");

    public static readonly IOnlineVerification NoVerification = new DisabledVerification();

    private sealed class DisabledVerification : IOnlineVerification
    {
        public Task VerifyAsync(
            Guid restaurantId,
            Guid requestId,
            string? token,
            CancellationToken ct
        ) => Task.CompletedTask;
    }

    public static readonly PushQueue NoPush = new(new PushKeys(Options.Create(new PushOptions())));

    public static OrderLineSnapshot Line(
        Guid menuItemId,
        long unitPriceCents = 1200,
        int quantity = 2
    ) =>
        new()
        {
            MenuItemId = menuItemId,
            ItemCode = "R1",
            NameZh = "拉面",
            NameIt = "Ramen",
            NameEn = "Ramen",
            AllergenCodes = ["GLUTEN"],
            UnitPriceCents = unitPriceCents,
            Quantity = quantity,
            Remark = "Senza cipolla",
            Options =
            [
                new OrderItemOption
                {
                    GroupNameIt = "Piccantezza",
                    NameIt = "Media",
                    PriceDeltaCents = 0,
                },
            ],
        };

    // A pickup request submitted at submittedAt; it waits for ten minutes. Numbers must be distinct per day.
    public static OnlineRequest Request(
        Guid restaurantId,
        DateTime submittedAt,
        int number,
        Guid? menuItemId = null
    )
    {
        var line = Line(menuItemId ?? Guid.NewGuid());
        return new OnlineRequest
        {
            Id = Guid.CreateVersion7(),
            RestaurantId = restaurantId,
            ClientRequestId = Guid.NewGuid(),
            StatusToken = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32)),
            BusinessDate = DateOnly.FromDateTime(submittedAt),
            Number = number,
            Fulfillment = OnlineFulfillment.Pickup,
            CustomerName = "Marco",
            CustomerPhone = "+393331234567",
            Lines = [line],
            ItemsTotalCents = line.UnitPriceCents * line.Quantity,
            DefaultLanguageSnapshot = "it",
            SubmittedAt = submittedAt,
            ExpiresAt = submittedAt.AddMinutes(10),
        };
    }

    // Marks the request accepted and returns the ACTIVE pickup session with its single order; add all three.
    public static DiningSession Accept(
        OnlineRequest request,
        DateTime acceptedAt,
        bool menuItemExists
    )
    {
        var session = new DiningSession
        {
            Id = Guid.CreateVersion7(),
            RestaurantId = request.RestaurantId,
            Channel = SessionChannel.Pickup,
            OpenedAt = acceptedAt,
        };
        var order = new Order
        {
            Id = Guid.CreateVersion7(),
            RestaurantId = request.RestaurantId,
            DiningSession = session,
            ClientRequestId = request.ClientRequestId,
            TotalAmountCents = request.ItemsTotalCents,
            DefaultLanguageSnapshot = request.DefaultLanguageSnapshot,
            CreatedAt = acceptedAt,
        };
        foreach (var line in request.Lines)
            order.Items.Add(line.ToOrderItem(request.RestaurantId, menuItemExists));
        session.Orders.Add(order);
        request.AcceptedAt = acceptedAt;
        request.EstimatedAt = acceptedAt.AddMinutes(20);
        request.Session = session;
        return session;
    }

    public const string Password = "Online-ordering-password-123";

    // An ACTIVE restaurant with online ordering, a phone and hours: every day 11:00-15:00, plus 18:00-22:00
    // on Monday and 00:00-02:00 on Tuesday. Two dishes: ramen, and spicy ramen with a required spice level.
    public static async Task<OnlineShop> SeedShopAsync(PostgreSqlFixture database)
    {
        await using var db = database.CreateContext();
        var restaurant = new Restaurant
        {
            Id = Guid.NewGuid(),
            Name = "Online",
            DefaultLanguage = "it",
            ServiceStatus = RestaurantServiceStatus.Active,
            OnlineEnabled = true,
            Slug = $"online-{Guid.NewGuid():N}"[..30],
            PublicPhone = "+390212345678",
        };
        var staff = new RestaurantUser
        {
            Restaurant = restaurant,
            Username = "online." + Guid.NewGuid().ToString("N"),
            PasswordHash = "",
            Role = RestaurantUserRole.Staff,
            MustChangePassword = false,
        };
        staff.PasswordHash = new PasswordHasher<RestaurantUser>().HashPassword(staff, Password);
        var owner = new RestaurantUser
        {
            Restaurant = restaurant,
            Username = "online.owner." + Guid.NewGuid().ToString("N"),
            PasswordHash = "",
            Role = RestaurantUserRole.Owner,
            MustChangePassword = false,
        };
        owner.PasswordHash = new PasswordHasher<RestaurantUser>().HashPassword(owner, Password);
        var category = new MenuCategory { Restaurant = restaurant, NameIt = "Ramen" };
        var dish = new MenuItem
        {
            Restaurant = restaurant,
            Category = category,
            NameIt = "Ramen",
            PriceCents = 1200,
            AllergenCodes = ["GLUTEN"],
            AllergenReviewed = true,
        };
        var spicy = new MenuItem
        {
            Restaurant = restaurant,
            Category = category,
            NameIt = "Ramen piccante",
            PriceCents = 1300,
            AllergenCodes = ["GLUTEN"],
            AllergenReviewed = true,
        };
        var group = new MenuOptionGroup
        {
            Restaurant = restaurant,
            NameIt = "Piccantezza",
            MinSelect = 1,
            MaxSelect = 1,
        };
        var hot = new MenuOption
        {
            RestaurantId = restaurant.Id,
            Group = group,
            NameIt = "Piccante",
            PriceDeltaCents = 150,
            AllergenCodes = ["SESAME"],
        };
        group.Options.Add(hot);
        group.Options.Add(
            new MenuOption
            {
                RestaurantId = restaurant.Id,
                Group = group,
                NameIt = "Delicato",
                Position = 1,
            }
        );
        db.AddRange(staff, owner, dish, spicy, group);
        await db.SaveChangesAsync();
        db.MenuItemOptionGroups.Add(
            new MenuItemOptionGroup
            {
                RestaurantId = restaurant.Id,
                MenuItemId = spicy.Id,
                GroupId = group.Id,
            }
        );
        foreach (var weekday in Enumerable.Range(1, 7))
            db.OnlineHours.Add(
                new OnlineHour
                {
                    RestaurantId = restaurant.Id,
                    Weekday = weekday,
                    Slot = weekday == 2 ? 2 : 1,
                    OpensMinute = 660,
                    ClosesMinute = 900,
                }
            );
        db.OnlineHours.Add(
            new OnlineHour
            {
                RestaurantId = restaurant.Id,
                Weekday = 1,
                Slot = 2,
                OpensMinute = 1080,
                ClosesMinute = 1320,
            }
        );
        db.OnlineHours.Add(
            new OnlineHour
            {
                RestaurantId = restaurant.Id,
                Weekday = 2,
                Slot = 1,
                OpensMinute = 0,
                ClosesMinute = 120,
            }
        );
        await db.SaveChangesAsync();
        return new OnlineShop(
            restaurant.Id,
            restaurant.Slug,
            staff,
            dish,
            spicy,
            group.Id,
            hot.Id,
            owner
        );
    }

    public static ApplicationDbContext Intercepted(
        PostgreSqlFixture database,
        DbCommandInterceptor interceptor
    ) =>
        new(
            new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseNpgsql(database.ConnectionString)
                .AddInterceptors(interceptor)
                .Options
        );

    public static async Task<HttpClient> LoginAsync(AccountTestHost host, RestaurantUser user)
    {
        var client = host.Browser();
        Assert.Equal(
            HttpStatusCode.OK,
            (await PostAsync(client, "/api/auth/login", new { user.Username, Password })).StatusCode
        );
        return client;
    }
}

internal sealed record OnlineShop(
    Guid RestaurantId,
    string Slug,
    RestaurantUser Staff,
    MenuItem Dish,
    MenuItem Spicy,
    Guid GroupId,
    Guid HotOptionId,
    RestaurantUser Owner
);

// Matches the restaurant row lock with the given strength.
internal sealed class OnlineLockGate(string locking, bool hold) : DbCommandInterceptor
{
    public TaskCompletionSource Attempted { get; } =
        new(TaskCreationOptions.RunContinuationsAsynchronously);
    public TaskCompletionSource Acquired { get; } =
        new(TaskCreationOptions.RunContinuationsAsynchronously);
    public TaskCompletionSource Release { get; } =
        new(TaskCreationOptions.RunContinuationsAsynchronously);

    private bool Matches(DbCommand command) =>
        command.CommandText.Contains("FROM restaurants ", StringComparison.Ordinal)
        && command.CommandText.Contains(locking, StringComparison.Ordinal);

    public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<DbDataReader> result,
        CancellationToken ct = default
    )
    {
        if (Matches(command))
            Attempted.TrySetResult();
        return ValueTask.FromResult(result);
    }

    public override async ValueTask<DbDataReader> ReaderExecutedAsync(
        DbCommand command,
        CommandExecutedEventData eventData,
        DbDataReader result,
        CancellationToken ct = default
    )
    {
        if (Matches(command))
        {
            Acquired.TrySetResult();
            if (hold)
                await Release.Task.WaitAsync(TimeSpan.FromSeconds(10), ct);
        }
        return result;
    }
}
