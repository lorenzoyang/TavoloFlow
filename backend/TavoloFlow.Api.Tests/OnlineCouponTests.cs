using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Online;
using static TavoloFlow.Api.Tests.AccountTestHost;

namespace TavoloFlow.Api.Tests;

public sealed class OnlineCouponTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    private const string Settings = "/api/staff/online/settings";
    private const string Coupons = "/api/owner/online/coupons";

    // Monday 16 November 2026, 12:00 in Rome (CET, UTC+1): the restaurant's business date is the 16th.
    private static readonly DateTimeOffset MondayNoon = new(2026, 11, 16, 11, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Coupons_OwnerOnly_NormalizeListByCodeExpireAndDeleteIdempotently()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var shop = await OnlineTestData.SeedShopAsync(database);
        var other = await OnlineTestData.SeedShopAsync(database);
        using var owner = await OnlineTestData.LoginAsync(host, shop.Owner);
        using var staff = await OnlineTestData.LoginAsync(host, shop.Staff);
        using var otherOwner = await OnlineTestData.LoginAsync(host, other.Owner);

        await SettingsAsync(
            await SendAsync(
                owner,
                HttpMethod.Post,
                Coupons,
                new
                {
                    code = " estate10 ",
                    percentOff = 10,
                    validUntil = (string?)null,
                }
            )
        );
        var created = await SettingsAsync(
            await SendAsync(
                owner,
                HttpMethod.Post,
                Coupons,
                new
                {
                    code = "Autunno",
                    percentOff = 15,
                    validUntil = "2026-11-16",
                }
            )
        );
        Assert.Equal(
            [
                ("AUTUNNO", 15, (DateOnly?)new DateOnly(2026, 11, 16), false),
                ("ESTATE10", 10, (DateOnly?)null, false),
            ],
            created.Coupons.Select(c => (c.Code, c.PercentOff, c.ValidUntil, c.Expired))
        );
        await AssertErrorAsync(
            await SendAsync(
                owner,
                HttpMethod.Post,
                Coupons,
                new { code = "Estate10", percentOff = 20 }
            ),
            HttpStatusCode.Conflict,
            "COUPON_CODE_TAKEN"
        );
        // Codes are unique per restaurant only.
        await SettingsAsync(
            await SendAsync(
                otherOwner,
                HttpMethod.Post,
                Coupons,
                new { code = "ESTATE10", percentOff = 30 }
            )
        );

        foreach (
            var invalid in new object[]
            {
                new { code = "AB", percentOff = 10 },
                new { code = "ESTATE-10", percentOff = 10 },
                new { code = "ABCDEFGHIJKLMNOPQRSTU", percentOff = 10 },
                new { code = "   ", percentOff = 10 },
                new { percentOff = 10 },
                new { code = "NUOVO", percentOff = 0 },
                new { code = "NUOVO", percentOff = 51 },
                new { code = "NUOVO" },
                new
                {
                    code = "NUOVO",
                    percentOff = 10,
                    validUntil = "2026-11-15",
                },
                new
                {
                    code = "NUOVO",
                    percentOff = 10,
                    extra = true,
                },
            }
        )
            await AssertErrorAsync(
                await SendAsync(owner, HttpMethod.Post, Coupons, invalid),
                HttpStatusCode.BadRequest,
                "VALIDATION_FAILED"
            );

        // STAFF read the settings, coupons included, but never write coupons.
        Assert.Equal(2, (await ReadAsync(staff)).Coupons.Length);
        var autunno = created.Coupons[0].Id;
        await AssertErrorAsync(
            await SendAsync(
                staff,
                HttpMethod.Post,
                Coupons,
                new { code = "STAFF", percentOff = 5 }
            ),
            HttpStatusCode.Forbidden,
            "FORBIDDEN"
        );
        await AssertErrorAsync(
            await SendAsync(staff, HttpMethod.Delete, $"{Coupons}/{autunno}"),
            HttpStatusCode.Forbidden,
            "FORBIDDEN"
        );

        // The last valid day is inclusive in the restaurant's time zone: 00:30 on Tuesday in Rome.
        host.Clock.Set(new DateTimeOffset(2026, 11, 16, 23, 30, 0, TimeSpan.Zero));
        Assert.True((await ReadAsync(owner)).Coupons.Single(c => c.Code == "AUTUNNO").Expired);

        // Another restaurant's id deletes nothing; a repeat finds nothing left and still succeeds.
        var foreign = (await ReadAsync(otherOwner)).Coupons.Single().Id;
        Assert.Equal(
            2,
            (await SettingsAsync(await SendAsync(owner, HttpMethod.Delete, $"{Coupons}/{foreign}")))
                .Coupons
                .Length
        );
        for (var i = 0; i < 2; i++)
            Assert.Equal(
                ["ESTATE10"],
                (
                    await SettingsAsync(
                        await SendAsync(owner, HttpMethod.Delete, $"{Coupons}/{autunno}")
                    )
                ).Coupons.Select(c => c.Code)
            );
        Assert.Single((await ReadAsync(otherOwner)).Coupons);
    }

    [Fact]
    public async Task Coupons_LimitAndOnlineOff_RejectWithoutWriting()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(MondayNoon);
        var shop = await OnlineTestData.SeedShopAsync(database);
        using var owner = await OnlineTestData.LoginAsync(host, shop.Owner);
        await using (var db = database.CreateContext())
        {
            db.OnlineCoupons.AddRange(
                Enumerable
                    .Range(0, OnlineCoupons.MaxCoupons)
                    .Select(i => new OnlineCoupon
                    {
                        Id = Guid.CreateVersion7(),
                        RestaurantId = shop.RestaurantId,
                        Code = $"CODE{i:D2}",
                        PercentOff = 10,
                    })
            );
            await db.SaveChangesAsync();
        }
        await AssertErrorAsync(
            await SendAsync(
                owner,
                HttpMethod.Post,
                Coupons,
                new { code = "ONEMORE", percentOff = 5 }
            ),
            HttpStatusCode.Conflict,
            "COUPON_LIMIT"
        );
        // An existing code still reports the conflict first, so a repeated create explains itself.
        await AssertErrorAsync(
            await SendAsync(
                owner,
                HttpMethod.Post,
                Coupons,
                new { code = "code07", percentOff = 5 }
            ),
            HttpStatusCode.Conflict,
            "COUPON_CODE_TAKEN"
        );

        await using (var db = database.CreateContext())
            await db
                .Restaurants.Where(r => r.Id == shop.RestaurantId)
                .ExecuteUpdateAsync(u => u.SetProperty(r => r.OnlineEnabled, false));
        await AssertErrorAsync(
            await SendAsync(owner, HttpMethod.Delete, $"{Coupons}/{Guid.NewGuid()}"),
            HttpStatusCode.Conflict,
            "ONLINE_NOT_OFFERED"
        );
        await using var check = database.CreateContext();
        Assert.Equal(
            OnlineCoupons.MaxCoupons,
            await check.OnlineCoupons.CountAsync(c => c.RestaurantId == shop.RestaurantId)
        );
    }

    [Theory]
    [InlineData("lowercase")]
    [InlineData("percent")]
    [InlineData("duplicate")]
    [InlineData("requestCodeOnly")]
    [InlineData("requestPercent")]
    public async Task Database_InvalidCouponRows_AreRejectedByConstraints(string scenario)
    {
        var shop = await OnlineTestData.SeedShopAsync(database);
        await using var db = database.CreateContext();
        OnlineCoupon Coupon(string code, int percent) =>
            new()
            {
                Id = Guid.CreateVersion7(),
                RestaurantId = shop.RestaurantId,
                Code = code,
                PercentOff = percent,
            };
        var request = OnlineTestData.Request(shop.RestaurantId, MondayNoon.UtcDateTime, 1);
        switch (scenario)
        {
            case "lowercase":
                db.OnlineCoupons.Add(Coupon("estate", 10));
                break;
            case "percent":
                db.OnlineCoupons.Add(Coupon("ESTATE", 51));
                break;
            case "duplicate":
                db.OnlineCoupons.AddRange(Coupon("ESTATE", 10), Coupon("ESTATE", 20));
                break;
            case "requestCodeOnly":
                request.CouponCode = "ESTATE";
                db.OnlineRequests.Add(request);
                break;
            default:
                request.CouponCode = "ESTATE";
                request.CouponPercentOff = 60;
                db.OnlineRequests.Add(request);
                break;
        }
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
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
            request.Content = JsonContent.Create(body, body.GetType());
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
