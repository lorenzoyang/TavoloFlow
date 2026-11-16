using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Microsoft.Net.Http.Headers;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Guests;
using TavoloFlow.Api.Online;
using TavoloFlow.Api.Platform;
using TavoloFlow.Api.Push;

namespace TavoloFlow.Api.Tests;

public sealed class TestClock : TimeProvider
{
    private DateTimeOffset now = DateTimeOffset.UtcNow;

    public override DateTimeOffset GetUtcNow() => now;

    public void Advance(TimeSpan duration) => now += duration;

    // Pins an absolute instant, e.g. a weekday and hour in the restaurant's time zone. Set it before
    // signing in: tickets issued at the old time would otherwise look issued in the future or expired.
    public void Set(DateTimeOffset instant) => now = instant;
}

public sealed class AccountTestHost(
    PostgreSqlFixture database,
    bool lowLimits = false,
    bool production = false,
    bool push = false,
    Action<OnlineRateLimitOptions>? onlineLimits = null,
    Action<TurnstileOptions>? verificationOptions = null
) : WebApplicationFactory<Program>
{
    // The application server key of RFC 8291 Appendix A, so tests can compare with its public key.
    public const string PushPrivateKey =
        "c9f58f89813e9f8e872e71f42aa64e1757c9254dcc62b72ddc010bb4043ea11c";
    public const string PushPublicKey =
        "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
    public const string PushSubject = "mailto:push@example.test";

    public TestClock Clock { get; } = new();

    // Every push request goes here instead of the network, whether or not push is configured.
    public FakePushService PushService { get; } = new();
    public FakeTurnstileService VerificationService { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(production ? "Production" : "Development");
        builder.UseSetting("ConnectionStrings:Default", database.ConnectionString);
        builder.UseSetting(
            "DataProtection:KeyRingPath",
            Path.Combine(Path.GetTempPath(), "tavoloflow-test-keys")
        );
        if (push)
        {
            builder.UseSetting("WebPush:PrivateKey", PushPrivateKey);
            builder.UseSetting("WebPush:Subject", PushSubject);
        }
        builder.ConfigureServices(services =>
        {
            services.AddTransient<IStartupFilter, ClientIpStartupFilter>();
            services.Configure<TurnstileOptions>(options =>
            {
                options.Enabled = false;
                verificationOptions?.Invoke(options);
            });
            services
                .AddHttpClient(OnlineVerification.HttpClientName)
                .ConfigurePrimaryHttpMessageHandler(() => VerificationService);
            services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
            services.AddDbContext<ApplicationDbContext>(options =>
                options.UseNpgsql(database.ConnectionString)
            );
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Clock);
            services.Configure<CookieAuthenticationOptions>(
                StoreAuthentication.Scheme,
                options => options.TimeProvider = Clock
            );
            services.Configure<CookieAuthenticationOptions>(
                GuestAuthentication.Scheme,
                options => options.TimeProvider = Clock
            );
            services.Configure<CookieAuthenticationOptions>(
                PlatformAuthentication.Scheme,
                options => options.TimeProvider = Clock
            );
            services.Configure<AccountRateLimitOptions>(
                PlatformAuthentication.Scheme,
                options =>
                {
                    options.LoginPerIpPerMinute = lowLimits ? 3 : 1000;
                    options.LoginPerUsernamePerFiveMinutes = lowLimits ? 2 : 1000;
                    options.PasswordChangesPerMinute = lowLimits ? 1 : 1000;
                }
            );
            services.Configure<AccountRateLimitOptions>(options =>
            {
                options.LoginPerIpPerMinute = lowLimits ? 3 : 1000;
                options.LoginPerUsernamePerFiveMinutes = lowLimits ? 2 : 1000;
                options.PasswordChangesPerMinute = lowLimits ? 1 : 1000;
            });
            services.Configure<OnlineRateLimitOptions>(options =>
            {
                options.SubmissionsPerIpPerMinute = lowLimits ? 3 : 1000;
                options.SubmissionsPerIpPerTenMinutes = lowLimits ? 3 : 1000;
                options.MaxWaitingPerIp = 20;
                options.MenusPerIpPerMinute = 1000;
                options.StatusChecksPerIpPerMinute = 1000;
                options.RecoveriesPerIpPerMinute = 1000;
                options.ContextChecksPerIpPerMinute = 1000;
                options.CouponChecksPerIpPerTenMinutes = lowLimits ? 3 : 1000;
                onlineLimits?.Invoke(options);
            });
            services
                .AddHttpClient(PushSender.HttpClientName)
                .ConfigurePrimaryHttpMessageHandler(() => PushService);
            services.AddControllers().AddApplicationPart(typeof(AccountProbeController).Assembly);
        });
    }

    public HttpClient Browser(string? ip = null)
    {
        var client = CreateClient(
            new WebApplicationFactoryClientOptions
            {
                BaseAddress = new Uri("https://localhost"),
                AllowAutoRedirect = false,
            }
        );
        if (ip is not null)
            client.DefaultRequestHeaders.Add("X-Test-Client-IP", ip);
        return client;
    }

    private sealed class ClientIpStartupFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) =>
            app =>
            {
                app.Use(
                    async (context, proceed) =>
                    {
                        if (context.Request.Headers.TryGetValue("X-Test-Client-IP", out var ip))
                            context.Connection.RemoteIpAddress = IPAddress.Parse(ip.ToString());
                        await proceed();
                    }
                );
                next(app);
            };
    }

    public static async Task<string> CsrfAsync(HttpClient client)
    {
        var response = await client.GetFromJsonAsync<CsrfResponse>("/api/auth/csrf");
        return response!.Token;
    }

    public static async Task<HttpResponseMessage> PostAsync(
        HttpClient client,
        string path,
        object body,
        string? csrf = null
    )
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = JsonContent.Create(body),
        };
        request.Headers.Add("X-CSRF-TOKEN", csrf ?? await CsrfAsync(client));
        return await client.SendAsync(request);
    }

    public static async Task AssertErrorAsync(
        HttpResponseMessage response,
        HttpStatusCode status,
        string code
    )
    {
        Assert.Equal(status, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ApiError>();
        Assert.Equal(code, error!.Code);
        Assert.False(string.IsNullOrWhiteSpace(error.RequestId));
    }

    // A persistent login: the cookie and its non-refreshing ticket both expire 30 days after issue.
    public void AssertPersistentTicket(
        HttpResponseMessage response,
        string scheme,
        string cookieName
    )
    {
        var raw = response
            .Headers.GetValues("Set-Cookie")
            .Single(value => value.StartsWith(cookieName + "="));
        var cookie = SetCookieHeaderValue.Parse(raw);
        Assert.NotNull(cookie.Expires);
        var options = Services
            .GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>()
            .Get(scheme);
        var ticket = options.TicketDataFormat.Unprotect(cookie.Value.ToString());
        Assert.NotNull(ticket);
        Assert.True(ticket.Properties.IsPersistent);
        Assert.False(ticket.Properties.AllowRefresh);
        var expected = Clock.GetUtcNow().AddDays(30);
        Assert.InRange(ticket.Properties.ExpiresUtc!.Value, expected.AddSeconds(-1), expected);
        Assert.Equal(ticket.Properties.ExpiresUtc, cookie.Expires);
    }

    private sealed record CsrfResponse(string Token);
}

// Registered only by AccountTestHost, never by the production API.
[ApiController]
[Route("api/test-accounts")]
public sealed class AccountProbeController(CurrentAccount current, ApplicationDbContext context)
    : ControllerBase
{
    [HttpGet("staff")]
    [Authorize(Policy = StoreAuthentication.StaffPolicy)]
    public IActionResult Staff() => Ok(new { current.RequireUser().RestaurantId });

    [HttpGet("owner")]
    [Authorize(Policy = StoreAuthentication.OwnerPolicy)]
    public IActionResult Owner() => Ok();

    [HttpGet("restaurants/{restaurantId:guid}")]
    [Authorize(Policy = StoreAuthentication.StaffPolicy)]
    public async Task<IActionResult> Restaurant(Guid restaurantId) =>
        await context.Restaurants.AnyAsync(restaurant =>
            restaurant.Id == restaurantId && restaurant.Id == current.RequireUser().RestaurantId
        )
            ? Ok()
            : NotFound();
}
