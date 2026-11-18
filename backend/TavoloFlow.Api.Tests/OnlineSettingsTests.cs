using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Online;
using static TavoloFlow.Api.Tests.AccountTestHost;

namespace TavoloFlow.Api.Tests;

public sealed class OnlineSettingsTests(PostgreSqlFixture database)
    : IClassFixture<PostgreSqlFixture>
{
    private const string Password = "Online-settings-password-123";
    private const string Settings = "/api/staff/online/settings";
    private const string Pause = "/api/staff/online/pause";
    private const string Hours = "/api/owner/online/hours";
    private const string Phone = "/api/owner/online/phone";
    private const string Delivery = "/api/owner/online/delivery";

    // Monday 16 November 2026, 12:00 in Rome (CET, UTC+1).
    private static readonly DateTimeOffset MondayNoon = new(2026, 11, 16, 11, 0, 0, TimeSpan.Zero);

    private static DateTime Utc(int day, int hour, int minute = 0) =>
        new(2026, 11, day, hour, minute, 0, DateTimeKind.Utc);

    private static object Slot(int weekday, int opens, int closes) =>
        new
        {
            weekday,
            opensMinute = opens,
            closesMinute = closes,
        };

    [Fact]
    public async Task PhoneAndHours_OwnerOnly_ValidateNormalizeAndReplaceTheWeek()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var (owner, staff, _) = await SeedAsync(online: true);
        using var ownerClient = await LoginAsync(host, owner);
        using var staffClient = await LoginAsync(host, staff);

        var initial = await ReadAsync(staffClient);
        Assert.Equal(OnlineStatus.NotOffered, initial.Status);
        Assert.Null(initial.PublicPhone);
        Assert.Empty(initial.Hours);
        Assert.NotNull(initial.Slug);

        await AssertErrorAsync(
            await SendAsync(
                staffClient,
                HttpMethod.Patch,
                Phone,
                new { publicPhone = "0212345678" }
            ),
            HttpStatusCode.Forbidden,
            "FORBIDDEN"
        );
        await AssertErrorAsync(
            await SendAsync(
                staffClient,
                HttpMethod.Put,
                Hours,
                new { slots = Array.Empty<object>() }
            ),
            HttpStatusCode.Forbidden,
            "FORBIDDEN"
        );
        foreach (
            var invalid in new object[]
            {
                new { publicPhone = "12345" },
                new { publicPhone = "+39-333-1234567" },
                new { publicPhone = "phone" },
                new { publicPhone = "+1234567890123456" },
                new { publicPhone = "0212345678", extra = true },
            }
        )
            await AssertErrorAsync(
                await SendAsync(ownerClient, HttpMethod.Patch, Phone, invalid),
                HttpStatusCode.BadRequest,
                "VALIDATION_FAILED"
            );
        var phone = await SettingsAsync(
            await SendAsync(
                ownerClient,
                HttpMethod.Patch,
                Phone,
                new { publicPhone = " +39 333 123 4567 " }
            )
        );
        Assert.Equal("+393331234567", phone.PublicPhone);
        // With a phone but no hours, online ordering is closed and never opens.
        Assert.Equal(OnlineStatus.ClosedHours, phone.Status);
        Assert.Null(phone.NextOpensAt);

        foreach (
            var invalid in new object[]
            {
                new { },
                new { slots = (object?)null },
                new { slots = new[] { Slot(0, 720, 900) } },
                new { slots = new[] { Slot(8, 720, 900) } },
                new { slots = new[] { Slot(1, 900, 900) } },
                new { slots = new[] { Slot(1, 900, 720) } },
                new { slots = new[] { Slot(1, -1, 720) } },
                new { slots = new[] { Slot(1, 720, 1441) } },
                new { slots = new[] { Slot(1, 600, 700), Slot(1, 720, 900), Slot(1, 1000, 1200) } },
                new { slots = new[] { Slot(1, 720, 900), Slot(1, 840, 1200) } },
                new { slots = new object?[] { null } },
                new { slots = new[] { new { weekday = 1, opensMinute = 720 } } },
            }
        )
            await AssertErrorAsync(
                await SendAsync(ownerClient, HttpMethod.Put, Hours, invalid),
                HttpStatusCode.BadRequest,
                "VALIDATION_FAILED"
            );

        // Nothing invalid was stored.
        Assert.Empty((await ReadAsync(ownerClient)).Hours);
    }

    [Fact]
    public async Task Hours_ValidWeek_OpensNowAndReplacesEveryEarlierSlot()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var (owner, _, restaurantId) = await SeedAsync(online: true, phone: "0212345678");
        using var client = await LoginAsync(host, owner);
        var week = await SettingsAsync(
            await SendAsync(
                client,
                HttpMethod.Put,
                Hours,
                new { slots = new[] { Slot(2, 720, 900), Slot(1, 1080, 1440), Slot(1, 720, 900) } }
            )
        );
        Assert.Equal(
            [new(1, 720, 900), new(1, 1080, 1440), new OnlineHourResponse(2, 720, 900)],
            week.Hours
        );
        Assert.Equal(OnlineStatus.Open, week.Status);
        Assert.Equal(Utc(16, 14), week.CurrentSlotEndsAt);
        Assert.Null(week.NextOpensAt);
        await using (var db = database.CreateContext())
            Assert.Equal(
                [(1, 1, 720), (1, 2, 1080), (2, 1, 720)],
                (
                    await db
                        .OnlineHours.Where(h => h.RestaurantId == restaurantId)
                        .OrderBy(h => h.Weekday)
                        .ThenBy(h => h.Slot)
                        .ToArrayAsync()
                ).Select(h => (h.Weekday, h.Slot, h.OpensMinute))
            );

        // Adjacent slots are allowed: the second starts exactly when the first ends.
        var replaced = await SettingsAsync(
            await SendAsync(
                client,
                HttpMethod.Put,
                Hours,
                new { slots = new[] { Slot(3, 720, 900), Slot(3, 900, 1000) } }
            )
        );
        Assert.Equal([new(3, 720, 900), new OnlineHourResponse(3, 900, 1000)], replaced.Hours);
        Assert.Equal(OnlineStatus.ClosedHours, replaced.Status);
        Assert.Equal(Utc(18, 11), replaced.NextOpensAt);
        Assert.Null(replaced.CurrentSlotEndsAt);

        var cleared = await SettingsAsync(
            await SendAsync(client, HttpMethod.Put, Hours, new { slots = Array.Empty<object>() })
        );
        Assert.Empty(cleared.Hours);
        Assert.Null(cleared.NextOpensAt);

        // Clearing the phone stops online orders again.
        var noPhone = await SettingsAsync(
            await SendAsync(client, HttpMethod.Patch, Phone, new { publicPhone = "  " })
        );
        Assert.Null(noPhone.PublicPhone);
        Assert.Equal(OnlineStatus.NotOffered, noPhone.Status);
    }

    [Fact]
    public async Task Pause_SlotAndToday_LapseOnTheirOwnAndResumeClears()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var (owner, staff, _) = await SeedAsync(online: true, phone: "0212345678");
        using var ownerClient = await LoginAsync(host, owner);
        using var staffClient = await LoginAsync(host, staff);
        await SettingsAsync(
            await SendAsync(
                ownerClient,
                HttpMethod.Put,
                Hours,
                new { slots = new[] { Slot(1, 720, 900), Slot(1, 1080, 1440), Slot(2, 0, 60) } }
            )
        );
        foreach (
            var invalid in new object[] { new { }, new { until = "WEEK" }, new { until = "slot" } }
        )
            await AssertErrorAsync(
                await SendAsync(staffClient, HttpMethod.Put, Pause, invalid),
                HttpStatusCode.BadRequest,
                "VALIDATION_FAILED"
            );

        // STAFF may pause: until the current slot ends at 15:00.
        var slot = await SettingsAsync(
            await SendAsync(staffClient, HttpMethod.Put, Pause, new { until = "SLOT" })
        );
        Assert.Equal(OnlineStatus.Paused, slot.Status);
        Assert.Equal(Utc(16, 14), slot.PausedUntil);

        host.Clock.Advance(TimeSpan.FromHours(3));
        var afterSlot = await ReadAsync(staffClient);
        Assert.Equal(OnlineStatus.ClosedHours, afterSlot.Status);
        Assert.Null(afterSlot.PausedUntil);
        Assert.Equal(Utc(16, 17), afterSlot.NextOpensAt);
        // Outside the hours there is no slot to pause until.
        await AssertErrorAsync(
            await SendAsync(staffClient, HttpMethod.Put, Pause, new { until = "SLOT" }),
            HttpStatusCode.Conflict,
            "ONLINE_CLOSED"
        );

        // "No more orders today" works outside the hours too and lasts until local midnight.
        var today = await SettingsAsync(
            await SendAsync(staffClient, HttpMethod.Put, Pause, new { until = "TODAY" })
        );
        Assert.Equal(Utc(16, 23), today.PausedUntil);
        host.Clock.Advance(TimeSpan.FromHours(3.5));
        Assert.Equal(OnlineStatus.Paused, (await ReadAsync(staffClient)).Status);
        var resumed = await SettingsAsync(await SendAsync(staffClient, HttpMethod.Delete, Pause));
        Assert.Equal(OnlineStatus.Open, resumed.Status);
        Assert.Null(resumed.PausedUntil);

        await SettingsAsync(
            await SendAsync(ownerClient, HttpMethod.Put, Pause, new { until = "TODAY" })
        );
        host.Clock.Advance(TimeSpan.FromHours(6));
        // Tuesday 00:30: the pause has lapsed and Tuesday's 00:00-01:00 slot accepts orders.
        var tuesday = await ReadAsync(ownerClient);
        Assert.Equal(OnlineStatus.Open, tuesday.Status);
        Assert.Null(tuesday.PausedUntil);
        Assert.Equal(Utc(17, 0), tuesday.CurrentSlotEndsAt);
    }

    [Fact]
    public async Task Delivery_OwnerOnly_TrimsValidatesAndKeepsSettingsWhenOff()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var (owner, staff, restaurantId) = await SeedAsync(online: true, phone: "0212345678");
        using var ownerClient = await LoginAsync(host, owner);
        using var staffClient = await LoginAsync(host, staff);
        var tiers = new[] { new { maxMeters = 3000, feeCents = 200L } };

        var initial = await ReadAsync(staffClient);
        Assert.False(initial.DeliveryEnabled);
        Assert.Null(initial.DeliveryNoteIt);
        Assert.Empty(initial.DeliveryTiers);
        Assert.Null(initial.DeliveryOriginLat);

        await AssertErrorAsync(
            await SendAsync(staffClient, HttpMethod.Put, Delivery, new { enabled = false, tiers }),
            HttpStatusCode.Forbidden,
            "FORBIDDEN"
        );
        foreach (
            var invalid in new object[]
            {
                new { },
                new { enabled = (bool?)null, tiers },
                // The bands are required: an empty list means none.
                new { enabled = false },
                new
                {
                    enabled = false,
                    tiers,
                    noteIt = new string('a', 501),
                },
                new
                {
                    enabled = false,
                    tiers,
                    noteZh = " " + new string('配', 501) + " ",
                },
                new
                {
                    enabled = false,
                    tiers,
                    note = "unknown field",
                },
                new
                {
                    enabled = false,
                    tiers,
                    minOrderCents = 0L,
                },
                new
                {
                    enabled = false,
                    tiers,
                    minOrderCents = -100L,
                },
                new
                {
                    enabled = false,
                    tiers,
                    minOrderCents = 9_007_199_254_740_992L,
                },
            }
        )
            await AssertErrorAsync(
                await SendAsync(ownerClient, HttpMethod.Put, Delivery, invalid),
                HttpStatusCode.BadRequest,
                "VALIDATION_FAILED"
            );
        Assert.False((await ReadAsync(ownerClient)).DeliveryEnabled);

        // Notes are optional; blank ones are stored as null and the rest are trimmed.
        var on = await SettingsAsync(
            await SendAsync(
                ownerClient,
                HttpMethod.Put,
                Delivery,
                new
                {
                    enabled = true,
                    noteZh = "   ",
                    noteIt = $"  Solo Prato centro.{new string(' ', 600)}",
                    noteEn = (string?)null,
                    minOrderCents = 1500L,
                    originLat = 43.880153m,
                    originLng = 11.096122m,
                    tiers,
                }
            )
        );
        Assert.True(on.DeliveryEnabled);
        Assert.Equal(1500, on.DeliveryMinOrderCents);
        Assert.Null(on.DeliveryNoteZh);
        Assert.Equal("Solo Prato centro.", on.DeliveryNoteIt);
        Assert.Null(on.DeliveryNoteEn);
        // Delivery never changes whether customers can order: pickup stays open.
        Assert.Equal(initial.Status, on.Status);
        Assert.Equal(on.DeliveryNoteIt, (await ReadAsync(staffClient)).DeliveryNoteIt);

        var off = await SettingsAsync(
            await SendAsync(
                ownerClient,
                HttpMethod.Put,
                Delivery,
                new
                {
                    enabled = false,
                    noteIt = on.DeliveryNoteIt,
                    minOrderCents = 1500L,
                    originLat = 43.880153m,
                    originLng = 11.096122m,
                    tiers,
                }
            )
        );
        Assert.False(off.DeliveryEnabled);
        Assert.Equal(on.DeliveryNoteIt, off.DeliveryNoteIt);
        Assert.Equal(1500, off.DeliveryMinOrderCents);
        Assert.Equal(on.DeliveryTiers, off.DeliveryTiers);
        Assert.Equal(43.880153m, off.DeliveryOriginLat);

        await using (var db = database.CreateContext())
        {
            var stored = await db.Restaurants.AsNoTracking().SingleAsync(r => r.Id == restaurantId);
            Assert.False(stored.DeliveryEnabled);
            Assert.Equal("Solo Prato centro.", stored.DeliveryNoteIt);
            Assert.Equal(1500, stored.DeliveryMinOrderCents);
            Assert.Equal(
                (43.880153m, 11.096122m),
                (stored.DeliveryOriginLat, stored.DeliveryOriginLng)
            );
        }

        // The whole setting is replaced: what is left out is removed.
        var cleared = await SettingsAsync(
            await SendAsync(
                ownerClient,
                HttpMethod.Put,
                Delivery,
                new { enabled = false, tiers = Array.Empty<object>() }
            )
        );
        Assert.Null(cleared.DeliveryMinOrderCents);
        Assert.Null(cleared.DeliveryOriginLng);
        Assert.Empty(cleared.DeliveryTiers);
    }

    [Fact]
    public async Task Delivery_TiersAndCoordinates_ValidatedSortedAndNeededToTurnOn()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var (owner, _, restaurantId) = await SeedAsync(online: true, phone: "0212345678");
        using var client = await LoginAsync(host, owner);
        object Body(bool enabled, decimal? lat, decimal? lng, params object[] tiers) =>
            new
            {
                enabled,
                originLat = lat,
                originLng = lng,
                tiers,
            };
        object Tier(int maxMeters, long feeCents) => new { maxMeters, feeCents };

        foreach (
            var invalid in new[]
            {
                Body(false, 43.88m, null, Tier(3000, 200)),
                Body(false, 90.5m, 11m, Tier(3000, 200)),
                Body(false, 43.88m, -180.5m, Tier(3000, 200)),
                Body(false, null, null, Tier(3000, 200), Tier(3000, 300)),
                Body(false, null, null, Tier(0, 200)),
                Body(false, null, null, Tier(30_001, 200)),
                Body(false, null, null, Tier(3000, -1)),
                Body(false, null, null, new { maxMeters = 3000 }),
                Body(
                    false,
                    null,
                    null,
                    [.. Enumerable.Range(1, 6).Select(km => Tier(km * 1000, 100))]
                ),
                // Turning delivery on needs both the starting point and a band.
                Body(true, null, null, Tier(3000, 200)),
                Body(true, 43.88m, 11.09m),
            }
        )
            await AssertErrorAsync(
                await SendAsync(client, HttpMethod.Put, Delivery, invalid),
                HttpStatusCode.BadRequest,
                "VALIDATION_FAILED"
            );
        Assert.Empty((await ReadAsync(client)).DeliveryTiers);

        // Bands come back nearest first, a free one included; coordinates keep six decimals.
        var saved = await SettingsAsync(
            await SendAsync(
                client,
                HttpMethod.Put,
                Delivery,
                Body(
                    true,
                    43.88015349m,
                    11.0961215m,
                    Tier(10_000, 600),
                    Tier(3000, 0),
                    Tier(30_000, 1500),
                    Tier(6000, 400),
                    Tier(1, 0)
                )
            )
        );
        Assert.Equal(
            [
                new DeliveryTierResponse(1, 0),
                new DeliveryTierResponse(3000, 0),
                new DeliveryTierResponse(6000, 400),
                new DeliveryTierResponse(10_000, 600),
                new DeliveryTierResponse(30_000, 1500),
            ],
            saved.DeliveryTiers
        );
        Assert.Equal((43.880153m, 11.096122m), (saved.DeliveryOriginLat, saved.DeliveryOriginLng));

        // Saving replaces every band.
        var replaced = await SettingsAsync(
            await SendAsync(
                client,
                HttpMethod.Put,
                Delivery,
                Body(false, null, null, Tier(5000, 300))
            )
        );
        Assert.Equal([new DeliveryTierResponse(5000, 300)], replaced.DeliveryTiers);
        Assert.Null(replaced.DeliveryOriginLat);
        await using var db = database.CreateContext();
        Assert.Equal(1, await db.DeliveryTiers.CountAsync(t => t.RestaurantId == restaurantId));

        // The database keeps the starting point while delivery is on, whatever writes the row.
        var error = await Assert.ThrowsAsync<PostgresException>(() =>
            db
                .Restaurants.Where(r => r.Id == restaurantId)
                .ExecuteUpdateAsync(u => u.SetProperty(r => r.DeliveryEnabled, true))
        );
        Assert.Equal("ck_restaurant_delivery_ready", error.ConstraintName);
    }

    [Fact]
    public async Task Writes_OnlineNotOffered_RejectedWhileReadsReportTheState()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var (owner, _, restaurantId) = await SeedAsync(online: false);
        using var client = await LoginAsync(host, owner);
        Assert.Equal(OnlineStatus.NotOffered, (await ReadAsync(client)).Status);
        foreach (
            var (method, path, body) in new (HttpMethod, string, object?)[]
            {
                (HttpMethod.Patch, Phone, new { publicPhone = "0212345678" }),
                (HttpMethod.Put, Hours, new { slots = new[] { Slot(1, 720, 900) } }),
                (HttpMethod.Put, Delivery, new { enabled = false, tiers = Array.Empty<object>() }),
                (HttpMethod.Put, Pause, new { until = "TODAY" }),
                (HttpMethod.Delete, Pause, null),
            }
        )
            await AssertErrorAsync(
                await SendAsync(client, method, path, body),
                HttpStatusCode.Conflict,
                "ONLINE_NOT_OFFERED"
            );

        await using var db = database.CreateContext();
        await db
            .Restaurants.Where(r => r.Id == restaurantId)
            .ExecuteUpdateAsync(u =>
                u.SetProperty(r => r.OnlineEnabled, true)
                    .SetProperty(r => r.PublicPhone, "0212345678")
                    .SetProperty(r => r.ServiceStatus, RestaurantServiceStatus.Suspended)
            );
        Assert.Equal(OnlineStatus.Suspended, (await ReadAsync(client)).Status);
    }

    [Fact]
    public async Task Database_PhoneAndHours_ConstraintsAndCascadeDelete()
    {
        var (_, _, restaurantId) = await SeedAsync(online: true);
        await using var db = database.CreateContext();
        await Assert.ThrowsAnyAsync<Exception>(() =>
            db
                .Restaurants.Where(r => r.Id == restaurantId)
                .ExecuteUpdateAsync(u => u.SetProperty(r => r.PublicPhone, "+39 02"))
        );
        foreach (
            var invalid in new[]
            {
                new OnlineHour
                {
                    Weekday = 0,
                    Slot = 1,
                    OpensMinute = 0,
                    ClosesMinute = 60,
                },
                new OnlineHour
                {
                    Weekday = 1,
                    Slot = 3,
                    OpensMinute = 0,
                    ClosesMinute = 60,
                },
                new OnlineHour
                {
                    Weekday = 1,
                    Slot = 1,
                    OpensMinute = 60,
                    ClosesMinute = 60,
                },
                new OnlineHour
                {
                    Weekday = 1,
                    Slot = 1,
                    OpensMinute = 0,
                    ClosesMinute = 1441,
                },
            }
        )
        {
            await using var check = database.CreateContext();
            invalid.RestaurantId = restaurantId;
            check.OnlineHours.Add(invalid);
            await Assert.ThrowsAsync<DbUpdateException>(() => check.SaveChangesAsync());
        }
        db.OnlineHours.Add(
            new OnlineHour
            {
                RestaurantId = restaurantId,
                Weekday = 1,
                Slot = 1,
                OpensMinute = 0,
                ClosesMinute = 1440,
            }
        );
        await db.SaveChangesAsync();
        await db.RestaurantUsers.Where(u => u.RestaurantId == restaurantId).ExecuteDeleteAsync();
        await db.Restaurants.Where(r => r.Id == restaurantId).ExecuteDeleteAsync();
        Assert.False(await db.OnlineHours.AnyAsync(h => h.RestaurantId == restaurantId));
    }

    private async Task<(RestaurantUser Owner, RestaurantUser Staff, Guid RestaurantId)> SeedAsync(
        bool online,
        string? phone = null
    )
    {
        await using var db = database.CreateContext();
        var restaurant = new Restaurant
        {
            Name = "Online settings",
            DefaultLanguage = "it",
            ServiceStatus = RestaurantServiceStatus.Active,
            OnlineEnabled = online,
            Slug = $"online-{Guid.NewGuid():N}"[..30],
            PublicPhone = phone,
        };
        RestaurantUser User(RestaurantUserRole role)
        {
            var user = new RestaurantUser
            {
                Restaurant = restaurant,
                Username = $"online.{Guid.NewGuid():N}",
                PasswordHash = "",
                Role = role,
                MustChangePassword = false,
            };
            user.PasswordHash = new PasswordHasher<RestaurantUser>().HashPassword(user, Password);
            return user;
        }
        var owner = User(RestaurantUserRole.Owner);
        var staff = User(RestaurantUserRole.Staff);
        db.RestaurantUsers.AddRange(owner, staff);
        await db.SaveChangesAsync();
        return (owner, staff, restaurant.Id);
    }

    private static async Task<HttpClient> LoginAsync(AccountTestHost host, RestaurantUser user)
    {
        var client = host.Browser();
        Assert.Equal(
            HttpStatusCode.OK,
            (await PostAsync(client, "/api/auth/login", new { user.Username, Password })).StatusCode
        );
        return client;
    }

    private static async Task<HttpResponseMessage> SendAsync(
        HttpClient client,
        HttpMethod method,
        string path,
        object? body = null
    )
    {
        using var request = new HttpRequestMessage(method, path);
        if (body is not null)
            request.Content = JsonContent.Create(body);
        request.Headers.Add("X-CSRF-TOKEN", await CsrfAsync(client));
        return await client.SendAsync(request);
    }

    private static async Task<OnlineSettingsResponse> SettingsAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<OnlineSettingsResponse>())!;
    }

    private static async Task<OnlineSettingsResponse> ReadAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<OnlineSettingsResponse>(Settings))!;
}
