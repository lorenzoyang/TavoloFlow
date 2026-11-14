using System.Buffers.Text;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Push;
using static TavoloFlow.Api.Tests.AccountTestHost;
using static TavoloFlow.Api.Tests.OnlineTestData;

namespace TavoloFlow.Api.Tests;

public sealed class PushSubscriptionTests(PostgreSqlFixture database)
    : IClassFixture<PostgreSqlFixture>
{
    private const string Key = "/api/staff/push/key";
    private const string Subscription = "/api/staff/push/subscription";

    [Fact]
    public void PushKeys_RfcExampleKey_DerivesItsPublicKey()
    {
        var keys = new PushKeys(
            Options.Create(new PushOptions { PrivateKey = PushPrivateKey, Subject = PushSubject })
        );
        Assert.True(keys.Enabled);
        Assert.Equal(PushPublicKey, keys.PublicKey);
        Assert.Equal("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw", keys.PrivateKey);

        var off = new PushKeys(Options.Create(new PushOptions { PrivateKey = " ", Subject = "" }));
        Assert.False(off.Enabled);
        Assert.Null(off.PublicKey);

        foreach (
            var invalid in new[]
            {
                new PushOptions { PrivateKey = PushPrivateKey },
                new PushOptions { Subject = PushSubject },
                new PushOptions { PrivateKey = PushPrivateKey[..62], Subject = PushSubject },
                new PushOptions { PrivateKey = new string('g', 64), Subject = PushSubject },
                new PushOptions { PrivateKey = new string('0', 64), Subject = PushSubject },
                new PushOptions { PrivateKey = new string('f', 64), Subject = PushSubject },
                new PushOptions { PrivateKey = PushPrivateKey, Subject = "http://example.test" },
                new PushOptions { PrivateKey = PushPrivateKey, Subject = "mailto:" },
                new PushOptions { PrivateKey = PushPrivateKey, Subject = "push@example.test" },
            }
        )
            Assert.Throws<OptionsValidationException>(() => new PushKeys(Options.Create(invalid)));
    }

    [Fact]
    public void Startup_HalfConfiguredPush_FailsValidation()
    {
        using var host = new AccountTestHost(database);
        using var halfConfigured = host.WithWebHostBuilder(builder =>
            builder.UseSetting("WebPush:PrivateKey", PushPrivateKey)
        );
        var error = Assert.ThrowsAny<Exception>(() => halfConfigured.CreateClient());
        Assert.Contains("WebPush:Subject", error.ToString());
    }

    [Fact]
    public async Task Key_PushOff_ReturnsNullAndRegistrationIsRefused()
    {
        using var host = new AccountTestHost(database);
        var shop = await SeedShopAsync(database);
        using var anonymous = host.Browser();
        await AssertErrorAsync(
            await anonymous.GetAsync(Key),
            HttpStatusCode.Unauthorized,
            "UNAUTHENTICATED"
        );

        using var staff = await LoginAsync(host, shop.Staff);
        var key = await staff.GetFromJsonAsync<PushKeyResponse>(Key);
        Assert.Null(key!.PublicKey);
        await AssertErrorAsync(
            await SendAsync(staff, HttpMethod.Put, Subscription, Device(Fcm())),
            HttpStatusCode.Conflict,
            "PUSH_NOT_CONFIGURED"
        );
        // Removing always works, so signing out never depends on the server's configuration.
        Assert.Equal(
            HttpStatusCode.NoContent,
            (
                await SendAsync(staff, HttpMethod.Delete, Subscription, new { endpoint = Fcm() })
            ).StatusCode
        );
    }

    [Fact]
    public async Task Save_InvalidDevice_ReturnsValidationFailed()
    {
        using var host = new AccountTestHost(database, push: true);
        var shop = await SeedShopAsync(database);
        using var staff = await LoginAsync(host, shop.Staff);
        Assert.Equal(
            PushPublicKey,
            (await staff.GetFromJsonAsync<PushKeyResponse>(Key))!.PublicKey
        );

        var notOnCurve = Base64Url.EncodeToString([0x04, .. new byte[64]]);
        foreach (
            var invalid in new object[]
            {
                Device("http://fcm.googleapis.com/fcm/send/abc"),
                Device("https://example.com/push/abc"),
                Device("https://fcm.googleapis.com.example.com/fcm/send/abc"),
                Device("https://fcm.googleapis.com:8443/fcm/send/abc"),
                Device("https://user:secret@fcm.googleapis.com/fcm/send/abc"),
                Device("https://localhost/push"),
                Device("https://10.0.0.1/push"),
                Device("https://fcm.googleapis.com/" + new string('a', PushEndpoints.MaxLength)),
                Device("fcm.googleapis.com/fcm/send/abc"),
                Device(Fcm(), p256dh: Base64Url.EncodeToString(new byte[64])),
                Device(Fcm(), p256dh: notOnCurve),
                Device(Fcm(), p256dh: "not base64url!"),
                Device(Fcm(), auth: Base64Url.EncodeToString(new byte[15])),
                Device(Fcm(), language: "fr"),
                new
                {
                    endpoint = Fcm(),
                    p256dh = DeviceKey(),
                    auth = AuthSecret(),
                },
                new
                {
                    endpoint = Fcm(),
                    p256dh = DeviceKey(),
                    auth = AuthSecret(),
                    language = "zh",
                    extra = true,
                },
            }
        )
            await AssertErrorAsync(
                await SendAsync(staff, HttpMethod.Put, Subscription, invalid),
                HttpStatusCode.BadRequest,
                "VALIDATION_FAILED"
            );

        foreach (
            var endpoint in new[]
            {
                Fcm(),
                "https://web.push.apple.com/QGuQyavXutnMH" + Guid.NewGuid().ToString("N"),
                "https://updates.push.services.mozilla.com/wpush/v2/" + Guid.NewGuid(),
                "https://wns2-par02p.notify.windows.com/w/?token=" + Guid.NewGuid(),
            }
        )
            Assert.Equal(
                HttpStatusCode.NoContent,
                (await SendAsync(staff, HttpMethod.Put, Subscription, Device(endpoint))).StatusCode
            );
        await using var db = database.CreateContext();
        Assert.Equal(
            4,
            await db.PushSubscriptions.CountAsync(s => s.RestaurantId == shop.RestaurantId)
        );
    }

    [Fact]
    public async Task Save_SameEndpoint_UpdatesOneRowAndMovesBetweenAccounts()
    {
        using var host = new AccountTestHost(database, push: true);
        var shop = await SeedShopAsync(database);
        var other = await SeedShopAsync(database);
        var endpoint = Fcm();
        var signedInAt = host.Clock.GetUtcNow().UtcDateTime;
        using var staff = await LoginAsync(host, shop.Staff);

        Assert.Equal(
            HttpStatusCode.NoContent,
            (await SendAsync(staff, HttpMethod.Put, Subscription, Device(endpoint))).StatusCode
        );
        var saved = await RowAsync(endpoint);
        Assert.Equal(shop.RestaurantId, saved.RestaurantId);
        Assert.Equal(shop.Staff.Id, saved.UserId);
        Assert.Equal(1, saved.CredentialVersion);
        Assert.Equal("zh", saved.Language);
        // The device stops with the sign-in that registered it: the fixed 30-day ticket.
        Assert.InRange(
            saved.ExpiresAt,
            signedInAt.AddDays(30).AddSeconds(-1),
            signedInAt.AddDays(30).AddSeconds(1)
        );

        host.Clock.Advance(TimeSpan.FromMinutes(5));
        var keys = Device(endpoint, language: "it");
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await SendAsync(staff, HttpMethod.Put, Subscription, keys)).StatusCode
        );
        var updated = await RowAsync(endpoint);
        Assert.Equal(saved.Id, updated.Id);
        Assert.Equal("it", updated.Language);
        Assert.Equal(saved.CreatedAt, updated.CreatedAt);
        Assert.True(updated.UpdatedAt > saved.UpdatedAt);

        // Signing in as OWNER on the same device, or as another restaurant's account, moves the row.
        using var owner = await LoginAsync(host, shop.Owner);
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await SendAsync(owner, HttpMethod.Put, Subscription, Device(endpoint))).StatusCode
        );
        Assert.Equal(shop.Owner.Id, (await RowAsync(endpoint)).UserId);
        using var otherStaff = await LoginAsync(host, other.Staff);
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await SendAsync(otherStaff, HttpMethod.Put, Subscription, Device(endpoint))).StatusCode
        );
        var moved = await RowAsync(endpoint);
        Assert.Equal(other.RestaurantId, moved.RestaurantId);
        Assert.Equal(other.Staff.Id, moved.UserId);
        await using var db = database.CreateContext();
        Assert.Equal(1, await db.PushSubscriptions.CountAsync(s => s.Endpoint == endpoint));
    }

    [Fact]
    public async Task Save_OnlineOffOrPasswordChangePending_IsRefused()
    {
        using var host = new AccountTestHost(database, push: true);
        var shop = await SeedShopAsync(database);
        await using (var db = database.CreateContext())
        {
            await db
                .Restaurants.Where(r => r.Id == shop.RestaurantId)
                .ExecuteUpdateAsync(set => set.SetProperty(r => r.OnlineEnabled, false));
            await db
                .RestaurantUsers.Where(u => u.Id == shop.Owner.Id)
                .ExecuteUpdateAsync(set => set.SetProperty(u => u.MustChangePassword, true));
        }
        using var staff = await LoginAsync(host, shop.Staff);
        await AssertErrorAsync(
            await SendAsync(staff, HttpMethod.Put, Subscription, Device(Fcm())),
            HttpStatusCode.Conflict,
            "ONLINE_NOT_OFFERED"
        );
        using var owner = await LoginAsync(host, shop.Owner);
        await AssertErrorAsync(
            await SendAsync(owner, HttpMethod.Put, Subscription, Device(Fcm())),
            HttpStatusCode.Forbidden,
            "PASSWORD_CHANGE_REQUIRED"
        );
    }

    [Fact]
    public async Task Save_DeviceLimit_CountsOnlyDevicesThatStillReceive()
    {
        using var host = new AccountTestHost(database, push: true);
        var shop = await SeedShopAsync(database);
        var now = host.Clock.GetUtcNow().UtcDateTime;
        var registered = Enumerable
            .Range(0, PushSubscriptionService.MaxDevicesPerRestaurant)
            .Select(_ => Row(shop, shop.Staff.Id, now))
            .ToList();
        await using (var db = database.CreateContext())
        {
            db.PushSubscriptions.AddRange(registered);
            await db.SaveChangesAsync();
        }
        using var staff = await LoginAsync(host, shop.Staff);
        await AssertErrorAsync(
            await SendAsync(staff, HttpMethod.Put, Subscription, Device(Fcm())),
            HttpStatusCode.Conflict,
            "PUSH_DEVICE_LIMIT"
        );
        // A device already registered can still save itself again.
        Assert.Equal(
            HttpStatusCode.NoContent,
            (
                await SendAsync(
                    staff,
                    HttpMethod.Put,
                    Subscription,
                    Device(registered[0].Endpoint, language: "en")
                )
            ).StatusCode
        );

        // A device whose sign-in expired no longer counts, and registering removes it.
        await using (var db = database.CreateContext())
            await db
                .PushSubscriptions.Where(s => s.Id == registered[1].Id)
                .ExecuteUpdateAsync(set => set.SetProperty(s => s.ExpiresAt, now));
        var fresh = Fcm();
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await SendAsync(staff, HttpMethod.Put, Subscription, Device(fresh))).StatusCode
        );
        await using var check = database.CreateContext();
        Assert.False(await check.PushSubscriptions.AnyAsync(s => s.Id == registered[1].Id));
        Assert.Equal(
            PushSubscriptionService.MaxDevicesPerRestaurant,
            await check.PushSubscriptions.CountAsync(s => s.RestaurantId == shop.RestaurantId)
        );
    }

    [Fact]
    public async Task Remove_OnlyThisRestaurantsDevice_IsIdempotent()
    {
        using var host = new AccountTestHost(database, push: true);
        var shop = await SeedShopAsync(database);
        var other = await SeedShopAsync(database);
        var now = host.Clock.GetUtcNow().UtcDateTime;
        var mine = Row(shop, shop.Staff.Id, now);
        var theirs = Row(other, other.Staff.Id, now);
        await using (var db = database.CreateContext())
        {
            db.PushSubscriptions.AddRange(mine, theirs);
            await db.SaveChangesAsync();
        }
        using var owner = await LoginAsync(host, shop.Owner);
        foreach (var endpoint in new[] { mine.Endpoint, mine.Endpoint, theirs.Endpoint })
            Assert.Equal(
                HttpStatusCode.NoContent,
                (
                    await SendAsync(owner, HttpMethod.Delete, Subscription, new { endpoint })
                ).StatusCode
            );
        await AssertErrorAsync(
            await SendAsync(owner, HttpMethod.Delete, Subscription, new { }),
            HttpStatusCode.BadRequest,
            "VALIDATION_FAILED"
        );
        await using var check = database.CreateContext();
        Assert.False(await check.PushSubscriptions.AnyAsync(s => s.Id == mine.Id));
        Assert.True(await check.PushSubscriptions.AnyAsync(s => s.Id == theirs.Id));
    }

    [Fact]
    public async Task DeleteRestaurantOrAccount_CascadesToDevices()
    {
        var shop = await SeedShopAsync(database);
        var now = DateTime.UtcNow;
        var staffDevice = Row(shop, shop.Staff.Id, now);
        var ownerDevice = Row(shop, shop.Owner.Id, now);
        await using var db = database.CreateContext();
        db.PushSubscriptions.AddRange(staffDevice, ownerDevice);
        await db.SaveChangesAsync();

        await db.RestaurantUsers.Where(u => u.Id == shop.Staff.Id).ExecuteDeleteAsync();
        Assert.False(await db.PushSubscriptions.AnyAsync(s => s.Id == staffDevice.Id));
        Assert.True(await db.PushSubscriptions.AnyAsync(s => s.Id == ownerDevice.Id));
        await db.Restaurants.Where(r => r.Id == shop.RestaurantId).ExecuteDeleteAsync();
        Assert.False(await db.PushSubscriptions.AnyAsync(s => s.RestaurantId == shop.RestaurantId));
    }

    internal static string Fcm() => "https://fcm.googleapis.com/fcm/send/" + Guid.NewGuid();

    internal static string DeviceKey()
    {
        using var key = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256);
        var point = key.ExportParameters(false).Q;
        return Base64Url.EncodeToString([0x04, .. point.X!, .. point.Y!]);
    }

    internal static string AuthSecret() =>
        Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(16));

    internal static object Device(
        string endpoint,
        string? p256dh = null,
        string? auth = null,
        string language = "zh"
    ) =>
        new
        {
            endpoint,
            p256dh = p256dh ?? DeviceKey(),
            auth = auth ?? AuthSecret(),
            language,
        };

    internal static PushSubscription Row(OnlineShop shop, Guid userId, DateTime now) =>
        new()
        {
            Id = Guid.NewGuid(),
            RestaurantId = shop.RestaurantId,
            UserId = userId,
            Endpoint = Fcm(),
            P256dh = DeviceKey(),
            Auth = AuthSecret(),
            CredentialVersion = 1,
            Language = "zh",
            ExpiresAt = now.AddDays(30),
            CreatedAt = now,
            UpdatedAt = now,
        };

    internal static async Task<HttpResponseMessage> SendAsync(
        HttpClient client,
        HttpMethod method,
        string path,
        object body
    )
    {
        using var request = new HttpRequestMessage(method, path)
        {
            Content = JsonContent.Create(body),
        };
        request.Headers.Add("X-CSRF-TOKEN", await CsrfAsync(client));
        return await client.SendAsync(request);
    }

    private async Task<PushSubscription> RowAsync(string endpoint)
    {
        await using var db = database.CreateContext();
        return await db.PushSubscriptions.AsNoTracking().SingleAsync(s => s.Endpoint == endpoint);
    }
}
