using System.Buffers.Text;
using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Ordering;
using static TavoloFlow.Api.Tests.AccountTestHost;
using static TavoloFlow.Api.Tests.OnlineTestData;
using static TavoloFlow.Api.Tests.PushSubscriptionTests;

namespace TavoloFlow.Api.Tests;

public sealed class OnlinePushTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    private const string Subscription = "/api/staff/push/subscription";

    // Monday 16 November 2026, 12:00 in Rome: inside the seeded 11:00-15:00 slot.
    private static readonly DateTimeOffset MondayNoon = new(2026, 11, 16, 11, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Submit_AfterDeviceLogout_NotifiesOnlyRemainingDevices()
    {
        using var host = new AccountTestHost(database, push: true);
        host.Clock.Set(MondayNoon);
        var shop = await SeedShopAsync(database);
        using var first = new TestDevice();
        using var second = new TestDevice();
        using var browser = await LoginAsync(host, shop.Staff);
        await RegisterAsync(browser, first);
        await RegisterAsync(host, shop.Owner, second);
        Assert.Equal(
            HttpStatusCode.NoContent,
            (
                await PostAsync(browser, "/api/auth/logout", new { pushEndpoint = first.Endpoint })
            ).StatusCode
        );
        using var customer = host.Browser();
        Assert.Equal(
            HttpStatusCode.Created,
            (await SubmitAsync(customer, shop, Guid.NewGuid())).StatusCode
        );
        Assert.Equal(
            second.Endpoint,
            Assert.Single(await host.PushService.WaitForAsync(1)).Endpoint.ToString()
        );
    }

    [Theory]
    [InlineData(HttpStatusCode.Created)]
    [InlineData(HttpStatusCode.InternalServerError)]
    public async Task Send_DefaultHttpLogging_DoesNotExposeEndpointKeysOrPayload(
        HttpStatusCode result
    )
    {
        using var baseHost = new AccountTestHost(database, push: true);
        baseHost.Clock.Set(MondayNoon);
        using var logs = new CapturedLogs();
        using var host = baseHost.WithWebHostBuilder(builder =>
            builder.ConfigureLogging(logging =>
                logging.ClearProviders().AddProvider(logs).SetMinimumLevel(LogLevel.Trace)
            )
        );
        baseHost.PushService.Respond = _ => result;
        var shop = await SeedShopAsync(database);
        using var device = new TestDevice();
        using var browser = host.CreateClient(
            new WebApplicationFactoryClientOptions
            {
                BaseAddress = new Uri("https://localhost"),
                AllowAutoRedirect = false,
            }
        );
        await PostAsync(browser, "/api/auth/login", new { shop.Staff.Username, Password });
        await RegisterAsync(browser, device);
        using var customer = host.CreateClient(
            new WebApplicationFactoryClientOptions
            {
                BaseAddress = new Uri("https://localhost"),
                AllowAutoRedirect = false,
            }
        );
        Assert.Equal(
            HttpStatusCode.Created,
            (await SubmitAsync(customer, shop, Guid.NewGuid())).StatusCode
        );
        await baseHost.PushService.WaitForAsync(1);
        // The sender processes orders in sequence; the next send proves the first has completed.
        using var nextCustomer = host.CreateClient();
        Assert.Equal(
            HttpStatusCode.Created,
            (await SubmitAsync(nextCustomer, shop, Guid.NewGuid())).StatusCode
        );
        await baseHost.PushService.WaitForAsync(2);
        Assert.DoesNotContain(
            logs.Entries,
            entry =>
                entry.Category.StartsWith(
                    "System.Net.Http.HttpClient.push.",
                    StringComparison.Ordinal
                )
        );
        var body = JsonSerializer.SerializeToElement(device.Body());
        foreach (
            var secret in new[]
            {
                device.Endpoint,
                body.GetProperty("p256dh").GetString()!,
                body.GetProperty("auth").GetString()!,
                PushPrivateKey,
                "\"number\":",
            }
        )
            Assert.DoesNotContain(
                logs.Entries,
                entry => entry.Message.Contains(secret, StringComparison.Ordinal)
            );
    }

    private sealed class CapturedLogs : ILoggerProvider
    {
        public ConcurrentQueue<(string Category, string Message)> Entries { get; } = new();

        public ILogger CreateLogger(string categoryName) => new Capture(categoryName, Entries);

        public void Dispose() { }

        private sealed class Capture(string category, ConcurrentQueue<(string, string)> entries)
            : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state)
                where TState : notnull => null;

            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(
                LogLevel logLevel,
                EventId eventId,
                TState state,
                Exception? exception,
                Func<TState, Exception?, string> formatter
            ) => entries.Enqueue((category, formatter(state, exception)));
        }
    }

    [Fact]
    public async Task Submit_FirstSubmission_PushesEncryptedNumberToEveryDevice()
    {
        using var host = new AccountTestHost(database, push: true);
        host.Clock.Set(MondayNoon);
        var shop = await SeedShopAsync(database);
        var other = await SeedShopAsync(database);
        using var staffDevice = new TestDevice();
        using var ownerDevice = new TestDevice();
        using var otherDevice = new TestDevice();
        await RegisterAsync(host, shop.Staff, staffDevice, "zh");
        await RegisterAsync(host, shop.Owner, ownerDevice, "it");
        await RegisterAsync(host, other.Staff, otherDevice, "en");
        using var customer = host.Browser();
        var id = Guid.NewGuid();

        Assert.Equal(HttpStatusCode.Created, (await SubmitAsync(customer, shop, id)).StatusCode);
        var pushes = await host.PushService.WaitForAsync(2);
        foreach (var (device, language) in new[] { (staffDevice, "zh"), (ownerDevice, "it") })
        {
            var push = pushes.Single(p => p.Endpoint.ToString() == device.Endpoint);
            AssertVapid(push.Authorization, "https://fcm.googleapis.com");
            // The request expires ten minutes after submission; the notification lives as long.
            Assert.Equal("600", push.Ttl);
            Assert.Equal("high", push.Urgency);
            Assert.Equal("aes128gcm", push.ContentEncoding);
            // Only the number and language: never the customer's name, phone or address.
            Assert.Equal(
                $$"""{"number":1,"language":"{{language}}"}""",
                device.Read(push).GetRawText()
            );
        }

        // A repeat notifies nobody: the next push is the next order's.
        Assert.Equal(HttpStatusCode.OK, (await SubmitAsync(customer, shop, id)).StatusCode);
        using var nextCustomer = host.Browser();
        Assert.Equal(
            HttpStatusCode.Created,
            (await SubmitAsync(nextCustomer, shop, Guid.NewGuid())).StatusCode
        );
        var next = (await host.PushService.WaitForAsync(4))[2..];
        Assert.All(next, push => Assert.NotEqual(otherDevice.Endpoint, push.Endpoint.ToString()));
        Assert.Equal(
            2,
            staffDevice
                .Read(next.Single(p => p.Endpoint.ToString() == staffDevice.Endpoint))
                .GetProperty("number")
                .GetInt32()
        );
    }

    [Fact]
    public async Task Send_ResetOrExpiredSignIn_SkipsAndDeletesTheDevice()
    {
        using var host = new AccountTestHost(database, push: true);
        host.Clock.Set(MondayNoon);
        var shop = await SeedShopAsync(database);
        using var staffDevice = new TestDevice();
        using var ownerDevice = new TestDevice();
        using var expiredDevice = new TestDevice();
        await RegisterAsync(host, shop.Staff, staffDevice);
        using var owner = await LoginAsync(host, shop.Owner);
        await RegisterAsync(owner, ownerDevice);
        await RegisterAsync(owner, expiredDevice);
        await using (var db = database.CreateContext())
            await db
                .PushSubscriptions.Where(s => s.Endpoint == expiredDevice.Endpoint)
                .ExecuteUpdateAsync(set =>
                    set.SetProperty(s => s.ExpiresAt, MondayNoon.UtcDateTime)
                );
        // OWNER resets STAFF: a new credential version and a required password change.
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await PostAsync(
                    owner,
                    "/api/owner/staff/reset-password",
                    new { expectedCredentialVersion = 1 }
                )
            ).StatusCode
        );

        using var customer = host.Browser();
        Assert.Equal(
            HttpStatusCode.Created,
            (await SubmitAsync(customer, shop, Guid.NewGuid())).StatusCode
        );
        var push = Assert.Single(await host.PushService.WaitForAsync(1));
        Assert.Equal(ownerDevice.Endpoint, push.Endpoint.ToString());
        await using var check = database.CreateContext();
        Assert.Equal(
            [ownerDevice.Endpoint],
            await check
                .PushSubscriptions.Where(s => s.RestaurantId == shop.RestaurantId)
                .Select(s => s.Endpoint)
                .ToListAsync()
        );
    }

    [Fact]
    public async Task Send_OwnPasswordChange_StopsDeviceUntilItRegistersAgain()
    {
        using var host = new AccountTestHost(database, push: true);
        host.Clock.Set(MondayNoon);
        var shop = await SeedShopAsync(database);
        using var staffDevice = new TestDevice();
        using var ownerDevice = new TestDevice();
        using var staff = await LoginAsync(host, shop.Staff);
        await RegisterAsync(staff, staffDevice);
        await RegisterAsync(host, shop.Owner, ownerDevice);
        Assert.Equal(
            HttpStatusCode.OK,
            (
                await PostAsync(
                    staff,
                    "/api/auth/change-password",
                    new ChangePasswordRequest(Password, "Another-password-456")
                )
            ).StatusCode
        );

        using var customer = host.Browser();
        Assert.Equal(
            HttpStatusCode.Created,
            (await SubmitAsync(customer, shop, Guid.NewGuid())).StatusCode
        );
        Assert.Equal(
            ownerDevice.Endpoint,
            Assert.Single(await host.PushService.WaitForAsync(1)).Endpoint.ToString()
        );
        await using (var db = database.CreateContext())
            Assert.False(
                await db.PushSubscriptions.AnyAsync(s => s.Endpoint == staffDevice.Endpoint)
            );

        // The browser still holds its subscription; the new sign-in registers it again.
        await RegisterAsync(staff, staffDevice);
        using var nextCustomer = host.Browser();
        Assert.Equal(
            HttpStatusCode.Created,
            (await SubmitAsync(nextCustomer, shop, Guid.NewGuid())).StatusCode
        );
        var again = (await host.PushService.WaitForAsync(3))[1..];
        Assert.Equal(
            2,
            staffDevice
                .Read(again.Single(p => p.Endpoint.ToString() == staffDevice.Endpoint))
                .GetProperty("number")
                .GetInt32()
        );
    }

    [Fact]
    public async Task Send_InactiveOrPasswordPendingAccount_DeletesItsDevices()
    {
        using var host = new AccountTestHost(database, push: true);
        host.Clock.Set(MondayNoon);
        var shop = await SeedShopAsync(database);
        using var staffDevice = new TestDevice();
        using var ownerDevice = new TestDevice();
        await RegisterAsync(host, shop.Staff, staffDevice);
        await RegisterAsync(host, shop.Owner, ownerDevice);
        await using (var db = database.CreateContext())
        {
            await db
                .RestaurantUsers.Where(u => u.Id == shop.Staff.Id)
                .ExecuteUpdateAsync(set => set.SetProperty(u => u.IsActive, false));
            await db
                .RestaurantUsers.Where(u => u.Id == shop.Owner.Id)
                .ExecuteUpdateAsync(set => set.SetProperty(u => u.MustChangePassword, true));
        }

        using var customer = host.Browser();
        Assert.Equal(
            HttpStatusCode.Created,
            (await SubmitAsync(customer, shop, Guid.NewGuid())).StatusCode
        );
        await using var check = database.CreateContext();
        for (
            var waited = 0;
            waited < 10_000
                && await check.PushSubscriptions.AnyAsync(s => s.RestaurantId == shop.RestaurantId);
            waited += 20
        )
            await Task.Delay(20);
        Assert.False(
            await check.PushSubscriptions.AnyAsync(s => s.RestaurantId == shop.RestaurantId)
        );
        Assert.Empty(host.PushService.Requests);
    }

    [Fact]
    public async Task Send_GoneEndpoint_DeletesOnlyThatDevice()
    {
        using var host = new AccountTestHost(database, push: true);
        host.Clock.Set(MondayNoon);
        var shop = await SeedShopAsync(database);
        using var gone = new TestDevice();
        using var missing = new TestDevice();
        using var failing = new TestDevice();
        using var staff = await LoginAsync(host, shop.Staff);
        foreach (var device in new[] { gone, missing, failing })
            await RegisterAsync(staff, device);
        host.PushService.Respond = endpoint =>
            endpoint.ToString() == gone.Endpoint ? HttpStatusCode.Gone
            : endpoint.ToString() == missing.Endpoint ? HttpStatusCode.NotFound
            : HttpStatusCode.InternalServerError;

        using var customer = host.Browser();
        Assert.Equal(
            HttpStatusCode.Created,
            (await SubmitAsync(customer, shop, Guid.NewGuid())).StatusCode
        );
        await host.PushService.WaitForAsync(3);
        await using var check = database.CreateContext();
        for (
            var waited = 0;
            waited < 10_000
                && await check.PushSubscriptions.CountAsync(s =>
                    s.RestaurantId == shop.RestaurantId
                ) > 1;
            waited += 20
        )
            await Task.Delay(20);
        // A server error is the push service's problem, not proof the browser unsubscribed.
        Assert.Equal(
            [failing.Endpoint],
            await check
                .PushSubscriptions.Where(s => s.RestaurantId == shop.RestaurantId)
                .Select(s => s.Endpoint)
                .ToListAsync()
        );
        Assert.Equal(3, host.PushService.Requests.Length);
    }

    [Fact]
    public async Task Submit_PushOff_SendsNothing()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var shop = await SeedShopAsync(database);
        await using (var db = database.CreateContext())
        {
            db.PushSubscriptions.Add(Row(shop, shop.Staff.Id, MondayNoon.UtcDateTime));
            await db.SaveChangesAsync();
        }
        using var customer = host.Browser();
        Assert.Equal(
            HttpStatusCode.Created,
            (await SubmitAsync(customer, shop, Guid.NewGuid())).StatusCode
        );
        await Task.Delay(300);
        Assert.Empty(host.PushService.Requests);
    }

    private static async Task RegisterAsync(
        AccountTestHost host,
        Entities.RestaurantUser user,
        TestDevice device,
        string language = "zh"
    )
    {
        using var client = await LoginAsync(host, user);
        await RegisterAsync(client, device, language);
    }

    private static async Task RegisterAsync(
        HttpClient client,
        TestDevice device,
        string language = "zh"
    ) =>
        Assert.Equal(
            HttpStatusCode.NoContent,
            (
                await SendAsync(client, HttpMethod.Put, Subscription, device.Body(language))
            ).StatusCode
        );

    private static async Task<HttpResponseMessage> SubmitAsync(
        HttpClient client,
        OnlineShop shop,
        Guid id
    )
    {
        var csrf = (await client.GetFromJsonAsync<JsonElement>("/api/public/csrf"))
            .GetProperty("token")
            .GetString()!;
        return await PostAsync(
            client,
            $"/api/public/r/{shop.Slug}/requests",
            new
            {
                clientRequestId = id,
                fulfillment = "PICKUP",
                customerName = "Marco Rossi",
                customerPhone = "+39 333 123 4567",
                deliveryAddress = (string?)null,
                deliveryNotes = (string?)null,
                items = new[]
                {
                    new OrderLineInput(shop.Dish.Id, 1, shop.Dish.PriceCents, null, []),
                },
            },
            csrf
        );
    }

    // RFC 8292: "vapid t=<ES256 JWT for the push service origin>, k=<application server key>".
    private static void AssertVapid(string? authorization, string audience)
    {
        Assert.NotNull(authorization);
        Assert.StartsWith("vapid ", authorization);
        var parameters = authorization["vapid ".Length..]
            .Split(',', StringSplitOptions.TrimEntries)
            .Select(part => part.Split('=', 2))
            .ToDictionary(part => part[0], part => part[1]);
        Assert.Equal(PushPublicKey, parameters["k"]);
        var token = parameters["t"].Split('.');
        var header = JsonDocument.Parse(Base64Url.DecodeFromChars(token[0])).RootElement;
        Assert.Equal("ES256", header.GetProperty("alg").GetString());
        var claims = JsonDocument.Parse(Base64Url.DecodeFromChars(token[1])).RootElement;
        Assert.Equal(audience, claims.GetProperty("aud").GetString());
        Assert.Equal(PushSubject, claims.GetProperty("sub").GetString());
        Assert.True(
            claims.GetProperty("exp").GetInt64() > DateTimeOffset.UtcNow.ToUnixTimeSeconds()
        );
        var publicKey = Base64Url.DecodeFromChars(PushPublicKey);
        using var verifier = ECDsa.Create(
            new ECParameters
            {
                Curve = ECCurve.NamedCurves.nistP256,
                Q = new ECPoint { X = publicKey[1..33], Y = publicKey[33..] },
            }
        );
        Assert.True(
            verifier.VerifyData(
                Encoding.ASCII.GetBytes($"{token[0]}.{token[1]}"),
                Base64Url.DecodeFromChars(token[2]),
                HashAlgorithmName.SHA256
            )
        );
    }
}
