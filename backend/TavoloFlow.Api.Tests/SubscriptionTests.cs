using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Platform;
using static TavoloFlow.Api.Tests.AccountTestHost;
using static TavoloFlow.Api.Tests.PlatformAccountTests;

namespace TavoloFlow.Api.Tests;

public sealed class SubscriptionTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    private static string Path(Guid id) => $"/api/platform/restaurants/{id}/subscription";

    private async Task<HttpClient> Admin(AccountTestHost host)
    {
        var browser = host.Browser();
        Assert.Equal(HttpStatusCode.OK, (await LoginAsync(browser, await SeedAsync(database))).StatusCode);
        return browser;
    }

    private static async Task<CreatedRestaurant> Create(HttpClient admin, object? initialPeriod = null)
    {
        var response = await WriteAsync(admin, "/api/platform/restaurants", new
        {
            id = Guid.NewGuid(), name = "收费周期测试", defaultLanguage = "zh",
            ownerUsername = $"owner.{Guid.NewGuid():N}", staffUsername = $"staff.{Guid.NewGuid():N}",
            ownerContact = "  老板 WhatsApp +39 0000000000  ", defaultAnnualFeeCents = 50_000,
            initialPeriod
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<CreatedRestaurant>())!;
    }

    private static async Task<JsonElement> Read(HttpClient browser, string path)
    {
        var response = await browser.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    private static async Task<JsonElement> Write(HttpClient admin, string path, object body, HttpMethod? method = null)
    {
        var response = await WriteAsync(admin, path, body, method);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    // Reads and writes both return the subscription detail: { summary, periods }.
    private static int Version(JsonElement detail) => detail.GetProperty("summary").GetProperty("version").GetInt32();

    private static DateOnly Today(AccountTestHost host) => SubscriptionService.LocalDate("Europe/Rome", host.Clock.GetUtcNow());

    private static void SetTime(AccountTestHost host, DateTimeOffset at) => host.Clock.Advance(at - host.Clock.GetUtcNow());

    private static object Period(Guid id, DateOnly startsOn, DateOnly endsOn, int years = 1, long amountCents = 50_000, DateOnly? paidOn = null) =>
        new { id, startsOn, endsOn, years, amountCents, paidOn };

    private static async Task AddPeriod(HttpClient admin, Guid restaurantId, Guid id, int version, DateOnly startsOn,
        DateOnly endsOn, int years = 1, long amountCents = 50_000, DateOnly? paidOn = null)
    {
        await Write(admin, Path(restaurantId) + "/periods", new
        {
            expectedVersion = version, id, startsOn, endsOn, years, amountCents, paidOn
        });
    }

    [Fact]
    public async Task Payment_UnpaidTwoYearPeriod_PreservesAgreementAndRejectsResend()
    {
        using var host = new AccountTestHost(database);
        SetTime(host, new DateTimeOffset(2026, 11, 3, 12, 0, 0, TimeSpan.Zero));
        using var admin = await Admin(host);
        var periodId = Guid.NewGuid();
        var created = await Create(admin, Period(periodId, new(2026, 11, 1), new(2028, 11, 1), 2, 90_000));
        var path = Path(created.Restaurant.Id);
        var before = (await Read(admin, path)).GetProperty("summary");
        Assert.Equal("老板 WhatsApp +39 0000000000", before.GetProperty("ownerContact").GetString());
        Assert.Equal("ACTIVE", before.GetProperty("serviceState").GetString());
        Assert.Equal(1, before.GetProperty("unpaidPeriodCount").GetInt32());
        var body = new { expectedVersion = before.GetProperty("version").GetInt32(), paidOn = "2026-11-03" };
        var paid = await Write(admin, path + $"/periods/{periodId}/payment", body);
        Assert.Equal(0, paid.GetProperty("summary").GetProperty("unpaidPeriodCount").GetInt32());
        // A resend still carries the version it was confirmed against, so it cannot record the payment twice.
        await AssertErrorAsync(await WriteAsync(admin, path + $"/periods/{periodId}/payment", body),
            HttpStatusCode.Conflict, "SUBSCRIPTION_CHANGED");
        var period = Assert.Single((await Read(admin, path)).GetProperty("periods").EnumerateArray());
        Assert.Equal("2026-11-01", period.GetProperty("startsOn").GetString());
        Assert.Equal("2028-11-01", period.GetProperty("endsOn").GetString());
        Assert.Equal(2, period.GetProperty("years").GetInt32());
        Assert.Equal(90_000, period.GetProperty("amountCents").GetInt64());
        Assert.Equal("2026-11-03", period.GetProperty("paidOn").GetString());
        Assert.True(period.GetProperty("isPaid").GetBoolean());
    }

    [Fact]
    public async Task Payment_ConcurrentDuplicate_AppliesOnce()
    {
        using var host = new AccountTestHost(database); using var admin = await Admin(host);
        var created = await Create(admin); var path = Path(created.Restaurant.Id);
        var today = Today(host); var id = Guid.NewGuid();
        await AddPeriod(admin, created.Restaurant.Id, id, Version(await Read(admin, path)), today, today.AddYears(1));
        var body = new { expectedVersion = Version(await Read(admin, path)), paidOn = today };
        var target = path + $"/periods/{id}/payment";
        var results = await Task.WhenAll(WriteAsync(admin, target, body), WriteAsync(admin, target, body));
        Assert.Single(results, r => r.IsSuccessStatusCode);
        await AssertErrorAsync(results.Single(r => !r.IsSuccessStatusCode), HttpStatusCode.Conflict, "SUBSCRIPTION_CHANGED");
        var period = Assert.Single((await Read(admin, path)).GetProperty("periods").EnumerateArray());
        Assert.Equal(today.ToString("yyyy-MM-dd"), period.GetProperty("paidOn").GetString());
    }

    [Fact]
    public async Task Metadata_ConcurrentVersionAndPriceChange_PreservesExistingTerms()
    {
        using var host = new AccountTestHost(database); using var admin = await Admin(host);
        var today = Today(host); var periodId = Guid.NewGuid();
        var created = await Create(admin, Period(periodId, today, today.AddYears(1), paidOn: today));
        var path = Path(created.Restaurant.Id);
        var version = Version(await Read(admin, path));
        object Input(long fee) => new { expectedVersion = version, ownerContact = "老板", defaultAnnualFeeCents = fee };
        var results = await Task.WhenAll(WriteAsync(admin, path, Input(60_000), HttpMethod.Patch),
            WriteAsync(admin, path, Input(70_000), HttpMethod.Patch));
        Assert.Single(results, r => r.IsSuccessStatusCode);
        await AssertErrorAsync(results.Single(r => !r.IsSuccessStatusCode), HttpStatusCode.Conflict, "SUBSCRIPTION_CHANGED");
        var period = Assert.Single((await Read(admin, path)).GetProperty("periods").EnumerateArray());
        Assert.Equal(50_000, period.GetProperty("amountCents").GetInt64());
        Assert.Equal(today.AddYears(1).ToString("yyyy-MM-dd"), period.GetProperty("endsOn").GetString());
    }

    [Fact]
    public async Task Payment_StaleVersionAfterAmountChange_IsRejected()
    {
        using var host = new AccountTestHost(database); using var admin = await Admin(host);
        var today = Today(host); var id = Guid.NewGuid();
        var created = await Create(admin, Period(id, today, today.AddYears(1), amountCents: 10_000));
        var path = Path(created.Restaurant.Id);
        var observed = await Read(admin, path);
        Assert.Equal(10_000, observed.GetProperty("periods")[0].GetProperty("amountCents").GetInt64());
        var edited = await Write(admin, path + $"/periods/{id}", new
        {
            expectedVersion = Version(observed), startsOn = today, endsOn = today.AddYears(1), years = 1, amountCents = 20_000
        }, HttpMethod.Patch);
        Assert.Equal(Version(observed) + 1, Version(edited));
        await AssertErrorAsync(await WriteAsync(admin, path + $"/periods/{id}/payment", new
        {
            expectedVersion = Version(observed), paidOn = today
        }), HttpStatusCode.Conflict, "SUBSCRIPTION_CHANGED");
        var fresh = await Read(admin, path);
        Assert.Equal(Version(edited), Version(fresh));
        Assert.Equal(20_000, fresh.GetProperty("periods")[0].GetProperty("amountCents").GetInt64());
        Assert.False(fresh.GetProperty("periods")[0].GetProperty("isPaid").GetBoolean());
    }

    [Fact]
    public async Task Period_OverlapAndPaidEdits_AreRejectedWhileExpiryAdjustmentRemainsPossible()
    {
        using var host = new AccountTestHost(database); using var admin = await Admin(host);
        var today = Today(host); var id = Guid.NewGuid();
        var created = await Create(admin, Period(id, today, today.AddYears(1), paidOn: today));
        var path = Path(created.Restaurant.Id);
        var version = Version(await Read(admin, path));
        var overlap = await WriteAsync(admin, path + "/periods", new
        {
            expectedVersion = version, id = Guid.NewGuid(),
            startsOn = today.AddMonths(1), endsOn = today.AddYears(2), years = 2, amountCents = 100_000, paidOn = (DateOnly?)null
        });
        await AssertErrorAsync(overlap, HttpStatusCode.Conflict, "SUBSCRIPTION_PERIOD_OVERLAP");
        var edit = await WriteAsync(admin, path + $"/periods/{id}", new
        {
            expectedVersion = version, startsOn = today, endsOn = today.AddYears(1), years = 1, amountCents = 1
        }, HttpMethod.Patch);
        await AssertErrorAsync(edit, HttpStatusCode.Conflict, "SUBSCRIPTION_PERIOD_PAID");
        await Write(admin, path + $"/periods/{id}/expiry", new
        {
            expectedVersion = version, endsOn = today.AddYears(1).AddDays(5)
        }, HttpMethod.Patch);
        var period = Assert.Single((await Read(admin, path)).GetProperty("periods").EnumerateArray());
        Assert.Equal(today.AddYears(1).AddDays(5).ToString("yyyy-MM-dd"), period.GetProperty("endsOn").GetString());
        Assert.Equal(today.ToString("yyyy-MM-dd"), period.GetProperty("paidOn").GetString());
        Assert.Equal(50_000, period.GetProperty("amountCents").GetInt64());
    }

    [Fact]
    public async Task Summary_AdjacentRenewal_UsesFinalExpiryAndAcceptsAdvancePayment()
    {
        using var host = new AccountTestHost(database); using var admin = await Admin(host);
        var today = Today(host); var end = today.AddDays(5);
        var created = await Create(admin, Period(Guid.NewGuid(), end.AddYears(-1), end, paidOn: today));
        var path = Path(created.Restaurant.Id);
        var before = await Read(admin, path);
        Assert.True(before.GetProperty("summary").GetProperty("dueSoon").GetBoolean());
        await AddPeriod(admin, created.Restaurant.Id, Guid.NewGuid(), Version(before), end, end.AddYears(2), 2, 90_000, today);
        var summary = (await Read(admin, path)).GetProperty("summary");
        Assert.False(summary.GetProperty("dueSoon").GetBoolean());
        Assert.Equal(end.AddYears(2).ToString("yyyy-MM-dd"), summary.GetProperty("expiresOn").GetString());
        Assert.Equal(0, summary.GetProperty("unpaidPeriodCount").GetInt32());
    }

    [Fact]
    public async Task Summary_LocalMidnightAndLeapDay_UsesRestaurantCalendar()
    {
        using var host = new AccountTestHost(database);
        SetTime(host, new DateTimeOffset(2028, 2, 28, 23, 30, 0, TimeSpan.Zero));
        using var admin = await Admin(host);
        var created = await Create(admin, Period(Guid.NewGuid(), new(2028, 2, 29), new(2029, 2, 28)));
        var summary = (await Read(admin, Path(created.Restaurant.Id))).GetProperty("summary");
        Assert.Equal("2028-02-29", summary.GetProperty("localToday").GetString());
        Assert.Equal("ACTIVE", summary.GetProperty("serviceState").GetString());
        SetTime(host, new DateTimeOffset(2029, 2, 27, 23, 30, 0, TimeSpan.Zero));
        using var freshAdmin = await Admin(host);
        var expired = (await Read(freshAdmin, Path(created.Restaurant.Id))).GetProperty("summary");
        Assert.Equal("EXPIRED", expired.GetProperty("serviceState").GetString());
    }

    [Fact]
    public async Task Owner_ReadsOnlyOwnRestaurant_RejectsStaffAndOtherIdentities()
    {
        using var host = new AccountTestHost(database); using var admin = await Admin(host);
        var today = Today(host); var periodA = Guid.NewGuid();
        var a = await Create(admin, Period(periodA, today, today.AddYears(1)));
        var b = await Create(admin, Period(Guid.NewGuid(), today, today.AddYears(1)));
        using var owner = host.Browser(); using var staff = host.Browser();
        foreach (var (browser, role) in new[] { (owner, "OWNER"), (staff, "STAFF") })
        {
            var c = a.Credentials.Single(c => c.Account.Role == role);
            Assert.Equal(HttpStatusCode.OK, (await PostAsync(browser, "/api/auth/login", new { username = c.Account.Username, password = c.TemporaryPassword })).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await PostAsync(browser, "/api/auth/change-password", new { currentPassword = c.TemporaryPassword, newPassword = "123456" })).StatusCode);
        }
        var detail = await Read(owner, "/api/owner/subscription");
        Assert.Equal(periodA, Assert.Single(detail.GetProperty("periods").EnumerateArray()).GetProperty("id").GetGuid());
        Assert.Equal("老板 WhatsApp +39 0000000000", detail.GetProperty("summary").GetProperty("ownerContact").GetString());
        await AssertErrorAsync(await staff.GetAsync("/api/owner/subscription"), HttpStatusCode.Forbidden, "FORBIDDEN");
        await AssertErrorAsync(await owner.GetAsync(Path(b.Restaurant.Id)), HttpStatusCode.Unauthorized, "UNAUTHENTICATED");
        using var anonymous = host.Browser();
        await AssertErrorAsync(await anonymous.GetAsync("/api/owner/subscription"), HttpStatusCode.Unauthorized, "UNAUTHENTICATED");
        Assert.DoesNotContain("ownerContact", await owner.GetStringAsync("/api/auth/me"));
    }

    [Fact]
    public async Task Create_InvalidInitialPeriod_RollsBackRestaurantAndAccounts()
    {
        using var host = new AccountTestHost(database); using var admin = await Admin(host);
        var id = Guid.NewGuid(); var ownerUsername = $"owner.{Guid.NewGuid():N}";
        var response = await WriteAsync(admin, "/api/platform/restaurants", new
        {
            id, name = "invalid", defaultLanguage = "zh", ownerUsername,
            staffUsername = $"staff.{Guid.NewGuid():N}",
            initialPeriod = Period(Guid.NewGuid(), new(2026, 11, 1), new(2026, 11, 1))
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await using var db = database.CreateContext();
        Assert.False(await db.Restaurants.AnyAsync(r => r.Id == id));
        Assert.False(await db.RestaurantUsers.AnyAsync(u => u.Username == ownerUsername));
    }

    [Fact]
    public async Task Metadata_ContactChangeThenSameValues_IncrementsVersionOnce()
    {
        using var host = new AccountTestHost(database); using var admin = await Admin(host);
        var created = await Create(admin); var path = Path(created.Restaurant.Id);
        var version = Version(await Read(admin, path));
        var changed = await Write(admin, path, new
        {
            expectedVersion = version, ownerContact = "新联系方式", defaultAnnualFeeCents = 50_000
        }, HttpMethod.Patch);
        Assert.Equal(version + 1, Version(changed));
        Assert.Equal("新联系方式", changed.GetProperty("summary").GetProperty("ownerContact").GetString());
        // Surrounding whitespace is trimmed, so this save changes nothing and keeps the version.
        var noChange = await Write(admin, path, new
        {
            expectedVersion = version + 1, ownerContact = " 新联系方式 ", defaultAnnualFeeCents = 50_000
        }, HttpMethod.Patch);
        Assert.Equal(version + 1, Version(noChange));
        Assert.Equal(version + 1, Version(await Read(admin, path)));
    }

    [Fact]
    public async Task List_SubscriptionFiltersAndExpirySort_ReturnMatchingRestaurants()
    {
        using var host = new AccountTestHost(database); using var admin = await Admin(host);
        var today = Today(host);
        var soon = await Create(admin, Period(Guid.NewGuid(), today.AddYears(-1), today.AddDays(7)));
        var expired = await Create(admin, Period(Guid.NewGuid(), today.AddYears(-1), today));
        var unconfigured = await Create(admin);
        var due = await Read(admin, "/api/platform/restaurants?subscriptionStatus=DUE_SOON&sort=EXPIRY&pageSize=100");
        Assert.Contains(due.GetProperty("items").EnumerateArray(), r => r.GetProperty("id").GetGuid() == soon.Restaurant.Id);
        Assert.DoesNotContain(due.GetProperty("items").EnumerateArray(), r => r.GetProperty("id").GetGuid() == expired.Restaurant.Id);
        var overdue = await Read(admin, "/api/platform/restaurants?subscriptionStatus=EXPIRED&pageSize=100");
        Assert.Contains(overdue.GetProperty("items").EnumerateArray(), r => r.GetProperty("id").GetGuid() == expired.Restaurant.Id);
        var empty = await Read(admin, "/api/platform/restaurants?subscriptionStatus=UNCONFIGURED&pageSize=100");
        Assert.Contains(empty.GetProperty("items").EnumerateArray(), r => r.GetProperty("id").GetGuid() == unconfigured.Restaurant.Id);
        var unpaid = await Read(admin, "/api/platform/restaurants?subscriptionStatus=UNPAID&sort=EXPIRY&pageSize=100");
        var ids = unpaid.GetProperty("items").EnumerateArray().Select(r => r.GetProperty("id").GetGuid()).ToArray();
        Assert.Contains(expired.Restaurant.Id, ids); Assert.Contains(soon.Restaurant.Id, ids);
        Assert.True(Array.IndexOf(ids, expired.Restaurant.Id) < Array.IndexOf(ids, soon.Restaurant.Id));
        var counts = await Read(admin, "/api/platform/subscription-reminders");
        Assert.True(counts.GetProperty("dueSoonCount").GetInt32() >= 1);
        Assert.True(counts.GetProperty("expiredCount").GetInt32() >= 1);
        Assert.True(counts.GetProperty("unpaidCount").GetInt32() >= 2);
    }

    [Fact]
    public async Task Delete_Restaurant_CascadesPeriodsOnlyForThatTenant()
    {
        using var host = new AccountTestHost(database); using var admin = await Admin(host);
        var today = Today(host);
        var a = await Create(admin, Period(Guid.NewGuid(), today, today.AddYears(1), paidOn: today));
        var b = await Create(admin, Period(Guid.NewGuid(), today, today.AddYears(1)));
        await using var db = database.CreateContext();
        Assert.Equal(1, await db.Restaurants.Where(r => r.Id == a.Restaurant.Id).ExecuteDeleteAsync());
        Assert.False(await db.RestaurantSubscriptionPeriods.AnyAsync(p => p.RestaurantId == a.Restaurant.Id));
        Assert.True(await db.RestaurantSubscriptionPeriods.AnyAsync(p => p.RestaurantId == b.Restaurant.Id));
    }
}
