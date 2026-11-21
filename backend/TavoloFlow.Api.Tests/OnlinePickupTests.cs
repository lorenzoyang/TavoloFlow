using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Kitchen;
using TavoloFlow.Api.Online;
using TavoloFlow.Api.Ordering;
using static TavoloFlow.Api.Tests.AccountTestHost;

namespace TavoloFlow.Api.Tests;

public sealed class OnlinePickupTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    private static readonly DateTimeOffset Saturday = new(2026, 11, 21, 11, 0, 0, TimeSpan.Zero);
    private static readonly DateTime SundayPickup = Saturday.UtcDateTime.AddDays(1);

    [Fact]
    public async Task ReservationRange_ChangesNewChoicesAndKeepsConfirmedPickup()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(Saturday);
        var shop = await OnlineTestData.SeedShopAsync(database);
        using var owner = await OnlineTestData.LoginAsync(host, shop.Owner);
        using var staff = await OnlineTestData.LoginAsync(host, shop.Staff);
        using var customer = host.Browser();
        var path = $"/api/public/r/{shop.Slug}/bootstrap";
        var daySeven = Saturday.UtcDateTime.AddDays(7);

        using var initial = await ConfigureAsync(owner, 60);
        Assert.Equal(
            1,
            (await initial.Content.ReadFromJsonAsync<OnlineSettingsResponse>())!.PickupMaxDaysAhead
        );
        Assert.Equal(HttpStatusCode.BadRequest, (await ConfigureAsync(owner, 60, 3)).StatusCode);
        var original = (await customer.GetFromJsonAsync<OnlineMenuResponse>(path))!;
        Assert.DoesNotContain(daySeven, original.PickupTimes!);

        Assert.Equal(HttpStatusCode.OK, (await ConfigureAsync(owner, 60, 7)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ConfigureAsync(owner, null)).StatusCode);
        Assert.Null((await customer.GetFromJsonAsync<OnlineMenuResponse>(path))!.PickupCalendar);
        using var legacy = await ConfigureAsync(owner, 45);
        Assert.Equal(
            7,
            (await legacy.Content.ReadFromJsonAsync<OnlineSettingsResponse>())!.PickupMaxDaysAhead
        );

        var extended = (await customer.GetFromJsonAsync<OnlineMenuResponse>(path))!;
        Assert.Contains(daySeven, extended.PickupTimes!);
        Assert.DoesNotContain(daySeven.AddDays(1), extended.PickupTimes!);
        Assert.Equal(extended.PickupCalendar!.Times(), extended.PickupTimes!);
        Assert.Equal(
            HttpStatusCode.Conflict,
            (await SubmitAsync(customer, shop, daySeven.AddDays(1), Guid.NewGuid())).StatusCode
        );
        var requestId = Guid.NewGuid();
        using var submitted = await SubmitAsync(customer, shop, daySeven, requestId);
        Assert.Equal(HttpStatusCode.Created, submitted.StatusCode);
        var originalResponse =
            await submitted.Content.ReadFromJsonAsync<OnlineSubmissionResponse>();
        Assert.Equal(daySeven, originalResponse!.RequestedPickupAt);
        var pending = (
            await staff.GetFromJsonAsync<OnlinePendingPage>("/api/staff/online/pending")
        )!;
        Assert.Equal(
            HttpStatusCode.OK,
            (await AcceptAsync(staff, Assert.Single(pending.Items).Id, 20)).StatusCode
        );

        Assert.Equal(HttpStatusCode.OK, (await ConfigureAsync(owner, 60, 1)).StatusCode);
        Assert.Equal(
            HttpStatusCode.Conflict,
            (await SubmitAsync(customer, shop, daySeven, Guid.NewGuid())).StatusCode
        );
        using var retry = await SubmitAsync(customer, shop, daySeven, requestId);
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        Assert.Equal(
            originalResponse,
            await retry.Content.ReadFromJsonAsync<OnlineSubmissionResponse>()
        );
        var active = (await staff.GetFromJsonAsync<OnlineActivePage>("/api/staff/online/active"))!;
        Assert.Equal(daySeven, Assert.Single(active.Items).EstimatedAt);
    }

    [Fact]
    public async Task Reservation_ConfirmedForTomorrow_EntersKitchenAtSelectedPreparationTime()
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(Saturday);
        var shop = await OnlineTestData.SeedShopAsync(database);
        using var staff = await OnlineTestData.LoginAsync(host, shop.Staff);
        using var owner = await OnlineTestData.LoginAsync(host, shop.Owner);
        using var customer = host.Browser();
        var slots = $"/api/public/r/{shop.Slug}/bootstrap";
        Assert.Null((await customer.GetFromJsonAsync<OnlineMenuResponse>(slots))!.PickupTimes);
        Assert.Equal(HttpStatusCode.Forbidden, (await ConfigureAsync(staff, 60)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await ConfigureAsync(owner, 20)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ConfigureAsync(owner, 60)).StatusCode);
        var times = (await customer.GetFromJsonAsync<OnlineMenuResponse>(slots))!.PickupTimes!;
        Assert.Equal(Saturday.UtcDateTime.AddHours(1), times[0]);
        Assert.Contains(SundayPickup, times);
        Assert.DoesNotContain(SundayPickup.AddDays(1), times);

        var requestId = Guid.NewGuid();
        var prepared = await SubmitAsync(customer, shop, SundayPickup, requestId);
        Assert.Equal(HttpStatusCode.Created, prepared.StatusCode);
        var submitted = (await prepared.Content.ReadFromJsonAsync<OnlineSubmissionResponse>())!;
        Assert.Equal(SundayPickup, submitted.RequestedPickupAt);

        // A retry returns the original reservation even after the owner switches new reservations off.
        Assert.Equal(HttpStatusCode.OK, (await ConfigureAsync(owner, null)).StatusCode);
        var retry = await SubmitAsync(customer, shop, SundayPickup, requestId);
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        Assert.Equal(submitted, await retry.Content.ReadFromJsonAsync<OnlineSubmissionResponse>());
        var recovered = await customer.GetFromJsonAsync<OnlineSubmissionResponse>(
            $"/api/public/r/{shop.Slug}/requests/by-client-id/{requestId}"
        );
        Assert.Equal(submitted, recovered);

        var pending = Assert.Single(
            (await staff.GetFromJsonAsync<OnlinePendingPage>("/api/staff/online/pending"))!.Items
        );
        Assert.Equal(SundayPickup, pending.RequestedPickupAt);
        Assert.Equal(new[] { 10, 20, 30, 45 }, pending.AvailablePreparationMinutes);
        var accepted = await AcceptAsync(staff, pending.Id, 20);
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        var active = (await accepted.Content.ReadFromJsonAsync<OnlineActiveOrderResponse>())!;
        var starts = SundayPickup.AddMinutes(-20);
        Assert.Equal((SundayPickup, starts), (active.EstimatedAt, active.KitchenStartsAt!.Value));
        Assert.True(active.AwaitingPreparation);
        var statusPath = $"/api/public/online-orders/{submitted.StatusToken}";
        Assert.True(
            (
                await customer.GetFromJsonAsync<OnlineOrderStatusResponse>(statusPath)
            )!.AwaitingPreparation
        );

        await using var db = database.CreateContext();
        var order = await db
            .Orders.Include(o => o.Items)
            .SingleAsync(o => o.DiningSessionId == active.SessionId);
        var readyPath = $"/api/staff/orders/{order.Id}/items/{Assert.Single(order.Items).Id}/ready";
        host.Clock.Set(new DateTimeOffset(starts.AddSeconds(-1)));
        var before = await KitchenAsync(staff);
        Assert.Empty(before.Items);
        Assert.Equal(0, before.PendingCount);
        Assert.Null(before.LatestQueuedAt);
        Assert.Equal(
            HttpStatusCode.Conflict,
            (await PostAsync(staff, readyPath, new { })).StatusCode
        );

        var immediate = OnlineTestData.Request(
            shop.RestaurantId,
            starts.AddSeconds(-1),
            1,
            shop.Dish.Id
        );
        db.Add(OnlineTestData.Accept(immediate, starts.AddSeconds(-1), menuItemExists: true));
        db.Add(immediate);
        await db.SaveChangesAsync();
        host.Clock.Set(new DateTimeOffset(starts));
        var released = await KitchenAsync(staff);
        Assert.Equal(2, released.PendingCount);
        Assert.Equal(starts, released.LatestQueuedAt);
        Assert.Equal(
            new[] { immediate.SessionId!.Value, active.SessionId },
            released.Items.Select(o => o.SessionId)
        );
        var ticket = released.Items[1];
        var cancel = $"/api/staff/online/sessions/{active.SessionId}/cancel-reservation";
        Assert.Equal(
            HttpStatusCode.Conflict,
            (await PostAsync(staff, cancel, new { reason = "SOLD_OUT" })).StatusCode
        );
        Assert.Equal(Saturday.UtcDateTime, ticket.CreatedAt);
        Assert.Equal(starts, ticket.QueuedAt);
        Assert.Equal(SundayPickup, ticket.Online!.RequestedPickupAt);
        Assert.False(
            (
                await customer.GetFromJsonAsync<OnlineOrderStatusResponse>(statusPath)
            )!.AwaitingPreparation
        );
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(staff, readyPath, new { })).StatusCode);
        Assert.Equal(
            "READY",
            Assert
                .Single(
                    (await customer.GetFromJsonAsync<OnlineOrderStatusResponse>(statusPath))!.Items
                )
                .Status
        );
    }

    [Theory]
    [InlineData(null)]
    [InlineData("CANNOT_PREPARE_ON_TIME")]
    public async Task Reservation_OnlyAllowsFeasiblePreparation_AndCancellationVoidsIt(
        string? reason
    )
    {
        using var host = new AccountTestHost(database);
        host.Clock.Set(Saturday.AddMinutes(30));
        var shop = await OnlineTestData.SeedShopAsync(database);
        using var staff = await OnlineTestData.LoginAsync(host, shop.Staff);
        using var owner = await OnlineTestData.LoginAsync(host, shop.Owner);
        using var customer = host.Browser();
        Assert.Equal(HttpStatusCode.OK, (await ConfigureAsync(owner, 30)).StatusCode);

        var pickup = Saturday.UtcDateTime.AddHours(1);
        var lastSlots = (
            await customer.GetFromJsonAsync<OnlineMenuResponse>(
                $"/api/public/r/{shop.Slug}/bootstrap"
            )
        )!.PickupTimes!;
        var removed = pickup.AddMinutes(90);
        Assert.Contains(removed, lastSlots);
        using (var hours = new HttpRequestMessage(HttpMethod.Put, "/api/owner/online/hours"))
        {
            hours.Headers.Add("X-CSRF-TOKEN", await CsrfAsync(owner));
            hours.Content = JsonContent.Create(
                new
                {
                    slots = new[]
                    {
                        new
                        {
                            weekday = 6,
                            opensMinute = 660,
                            closesMinute = 840,
                        },
                    },
                }
            );
            Assert.Equal(HttpStatusCode.OK, (await owner.SendAsync(hours)).StatusCode);
        }
        Assert.Equal(
            HttpStatusCode.Conflict,
            (await SubmitAsync(customer, shop, removed, Guid.NewGuid())).StatusCode
        );
        var stale = await SubmitAsync(customer, shop, pickup.AddMinutes(-15), Guid.NewGuid());
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal(
            "ONLINE_PICKUP_SLOT_CHANGED",
            (await stale.Content.ReadFromJsonAsync<ApiError>())!.Code
        );
        var placed = await SubmitAsync(customer, shop, pickup, Guid.NewGuid());
        Assert.Equal(HttpStatusCode.Created, placed.StatusCode);
        var submission = (await placed.Content.ReadFromJsonAsync<OnlineSubmissionResponse>())!;
        Assert.Equal(1, submission.Number);

        host.Clock.Advance(TimeSpan.FromMinutes(7));
        var pending = Assert.Single(
            (await staff.GetFromJsonAsync<OnlinePendingPage>("/api/staff/online/pending"))!.Items
        );
        Assert.Equal(new[] { 10, 20 }, pending.AvailablePreparationMinutes);
        var tooLate = await AcceptAsync(staff, pending.Id, 30);
        Assert.Equal(HttpStatusCode.Conflict, tooLate.StatusCode);
        Assert.Equal(
            "ONLINE_PICKUP_PREP_TIME_UNAVAILABLE",
            (await tooLate.Content.ReadFromJsonAsync<ApiError>())!.Code
        );
        var accepted = await AcceptAsync(staff, pending.Id, 20);
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        var order = (await accepted.Content.ReadFromJsonAsync<OnlineActiveOrderResponse>())!;
        var cancel = $"/api/staff/online/sessions/{order.SessionId}/cancel-reservation";
        var statusPath = $"/api/public/online-orders/{submission.StatusToken}";
        using var invalid = await PostAsync(staff, cancel, new { reason = "CLOSING" });
        await AssertErrorAsync(invalid, HttpStatusCode.BadRequest, "VALIDATION_FAILED");
        Assert.True(
            (
                await customer.GetFromJsonAsync<OnlineOrderStatusResponse>(statusPath)
            )!.AwaitingPreparation
        );
        object input = reason is null ? new { } : new { reason };
        Assert.Equal(HttpStatusCode.NoContent, (await PostAsync(staff, cancel, input)).StatusCode);
        host.Clock.Set(new DateTimeOffset(pickup.AddMinutes(-20)));
        using var legacy = new HttpRequestMessage(HttpMethod.Post, cancel);
        legacy.Headers.Add("X-CSRF-TOKEN", await CsrfAsync(staff));
        Assert.Equal(HttpStatusCode.NoContent, (await staff.SendAsync(legacy)).StatusCode);
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await PostAsync(staff, cancel, new { reason = "CUSTOMER_REQUEST" })).StatusCode
        );
        var status = (await customer.GetFromJsonAsync<OnlineOrderStatusResponse>(statusPath))!;
        Assert.Equal(
            ("VOIDED", 0L, reason),
            (status.CloseReason, status.TotalAmountCents, status.ReservationCancelReason)
        );
        var kitchen = await KitchenAsync(staff);
        Assert.Empty(kitchen.Items);
        Assert.Null(kitchen.LatestQueuedAt);
        Assert.Empty(
            (await staff.GetFromJsonAsync<KitchenPage>("/api/staff/orders?status=PROCESSED"))!.Items
        );
        await using var db = database.CreateContext();
        var bill = await SessionSummaries.ReadAsync(
            db,
            shop.RestaurantId,
            order.SessionId,
            CancellationToken.None
        );
        Assert.Equal(
            ("VOIDED", 0L, 2),
            (bill.CloseReason, bill.TotalAmountCents, bill.BillVersion)
        );
    }

    private static async Task<HttpResponseMessage> ConfigureAsync(
        HttpClient client,
        int? minutes,
        int? maxDaysAhead = null
    )
    {
        using var request = new HttpRequestMessage(HttpMethod.Put, "/api/owner/online/pickup")
        {
            Content = maxDaysAhead is { } days
                ? JsonContent.Create(new { minNoticeMinutes = minutes, maxDaysAhead = days })
                : JsonContent.Create(new { minNoticeMinutes = minutes }),
        };
        request.Headers.Add("X-CSRF-TOKEN", await CsrfAsync(client));
        return await client.SendAsync(request);
    }

    private sealed record Csrf(string Token);

    private static async Task<HttpResponseMessage> SubmitAsync(
        HttpClient client,
        OnlineShop shop,
        DateTime pickup,
        Guid requestId
    )
    {
        var csrf = (await client.GetFromJsonAsync<Csrf>("/api/public/csrf"))!.Token;
        return await PostAsync(
            client,
            $"/api/public/r/{shop.Slug}/requests",
            new
            {
                clientRequestId = requestId,
                fulfillment = "PICKUP",
                requestedPickupAt = pickup,
                customerName = "Marco Rossi",
                customerPhone = "+393331234567",
                items = new[] { new OrderLineInput(shop.Dish.Id, 1, 1200, null, []) },
            },
            csrf
        );
    }

    private static Task<HttpResponseMessage> AcceptAsync(
        HttpClient client,
        Guid request,
        int minutes
    ) =>
        PostAsync(
            client,
            $"/api/staff/online/requests/{request}/accept",
            new { estimatedMinutes = minutes }
        );

    private static async Task<KitchenPage> KitchenAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<KitchenPage>("/api/staff/orders"))!;
}
