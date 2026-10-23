using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Guests;
using TavoloFlow.Api.Platform;

namespace TavoloFlow.Api.Tests;

public sealed class TestClock : TimeProvider
{
    private DateTimeOffset now = DateTimeOffset.UtcNow;
    public override DateTimeOffset GetUtcNow() => now;
    public void Advance(TimeSpan duration) => now += duration;
}

public sealed class AccountTestHost(PostgreSqlFixture database, bool lowLimits = false, bool production = false)
    : WebApplicationFactory<Program>
{
    public TestClock Clock { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(production ? "Production" : "Development");
        builder.UseSetting("ConnectionStrings:Default", database.ConnectionString);
        builder.UseSetting("DataProtection:KeyRingPath", Path.Combine(Path.GetTempPath(), "tavoloflow-test-keys"));
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
            services.AddDbContext<ApplicationDbContext>(options => options.UseNpgsql(database.ConnectionString));
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Clock);
            services.Configure<CookieAuthenticationOptions>(StoreAuthentication.Scheme,
                options => options.TimeProvider = Clock);
            services.Configure<CookieAuthenticationOptions>(GuestAuthentication.Scheme,
                options => options.TimeProvider = Clock);
            services.Configure<CookieAuthenticationOptions>(PlatformAuthentication.Scheme,
                options => options.TimeProvider = Clock);
            services.Configure<AccountRateLimitOptions>(PlatformAuthentication.Scheme, options =>
            {
                options.LoginPerIpPerMinute = lowLimits ? 3 : 1000;
                options.LoginPerUsernamePerFiveMinutes = lowLimits ? 2 : 1000;
                options.PasswordChangesPerMinute = lowLimits ? 1 : 1000;
            });
            services.Configure<AccountRateLimitOptions>(options =>
            {
                options.LoginPerIpPerMinute = lowLimits ? 3 : 1000;
                options.LoginPerUsernamePerFiveMinutes = lowLimits ? 2 : 1000;
                options.PasswordChangesPerMinute = lowLimits ? 1 : 1000;
            });
            services.AddControllers().AddApplicationPart(typeof(AccountProbeController).Assembly);
        });
    }

    public HttpClient Browser() => CreateClient(new WebApplicationFactoryClientOptions
    {
        BaseAddress = new Uri("https://localhost"),
        AllowAutoRedirect = false
    });

    public static async Task<string> CsrfAsync(HttpClient client)
    {
        var response = await client.GetFromJsonAsync<CsrfResponse>("/api/auth/csrf");
        return response!.Token;
    }

    public static async Task<HttpResponseMessage> PostAsync(
        HttpClient client, string path, object body, string? csrf = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("X-CSRF-TOKEN", csrf ?? await CsrfAsync(client));
        return await client.SendAsync(request);
    }

    public static async Task AssertErrorAsync(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        Assert.Equal(status, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ApiError>();
        Assert.Equal(code, error!.Code);
        Assert.False(string.IsNullOrWhiteSpace(error.RequestId));
    }

    private sealed record CsrfResponse(string Token);
}

// Registered only by AccountTestHost, never by the production API.
[ApiController]
[Route("api/test-accounts")]
public sealed class AccountProbeController(CurrentAccount current, ApplicationDbContext context) : ControllerBase
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
            restaurant.Id == restaurantId && restaurant.Id == current.RequireUser().RestaurantId)
            ? Ok() : NotFound();
}
