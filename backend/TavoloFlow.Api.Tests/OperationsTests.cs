using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using TavoloFlow.Api.Controllers;
using TavoloFlow.Api.Operations;
using TavoloFlow.Api.Platform;

namespace TavoloFlow.Api.Tests;

public sealed class OperationsTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    [Fact]
    public async Task Health_MigratedDatabase_ReturnsMinimalNonCachedStatus()
    {
        using var host = new AccountTestHost(database, production: true);
        using var browser = host.Browser();
        foreach (var (path, status) in new[] { ("live", "alive"), ("ready", "ready") })
        {
            var response = await browser.GetAsync($"/api/health/{path}");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal($"{{\"status\":\"{status}\"}}", await response.Content.ReadAsStringAsync());
            Assert.True(response.Headers.CacheControl!.NoStore);
        }
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.GetAsync("/api/unknown-path")).StatusCode);
    }

    [Fact]
    public async Task Health_PendingMigrations_ReturnsUnavailableWithoutDetails()
    {
        await using var empty = await database.CreateIsolatedContextAsync();
        var controller = new HealthController(empty, NullLogger<HealthController>.Instance);
        var result = Assert.IsType<ObjectResult>(await controller.Ready(default));
        Assert.Equal(503, result.StatusCode);
        Assert.Equal("{\"status\":\"not-ready\"}", System.Text.Json.JsonSerializer.Serialize(result.Value));
    }

    [Theory]
    [InlineData("10.44.0.2", true)]
    [InlineData("10.44.0.3", false)]
    public async Task Forwarding_OnlyConfiguredProxy_ChangesSchemeAndClientIp(string remoteIp, bool trusted)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        { ["ReverseProxy:KnownProxies:0"] = "10.44.0.2" }).Build();
        using var services = new ServiceCollection().AddLogging().AddDeployment(configuration).BuildServiceProvider();
        var options = services.GetRequiredService<IOptions<ForwardedHeadersOptions>>();
        var middleware = new ForwardedHeadersMiddleware(_ => Task.CompletedTask, NullLoggerFactory.Instance, options);
        var context = new DefaultHttpContext();
        context.Connection.RemoteIpAddress = IPAddress.Parse(remoteIp);
        context.Request.Scheme = "http";
        context.Request.Headers["X-Forwarded-For"] = "203.0.113.25";
        context.Request.Headers["X-Forwarded-Proto"] = "https";
        await middleware.Invoke(context);
        Assert.Equal(trusted ? "https" : "http", context.Request.Scheme);
        Assert.Equal(trusted ? "203.0.113.25" : remoteIp, context.Connection.RemoteIpAddress!.ToString());
    }

    [Fact]
    public async Task PlatformCookie_Production_UsesSecureScopedFixedTicket()
    {
        using var host = new AccountTestHost(database, production: true);
        using var browser = host.Browser();
        var response = await PlatformAccountTests.LoginAsync(browser, await PlatformAccountTests.SeedAsync(database));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var cookie = Assert.Single(response.Headers.GetValues("Set-Cookie"), c => c.StartsWith("TavoloFlow.Platform="));
        Assert.Contains("path=/api/platform", cookie); Assert.Contains("secure", cookie); Assert.Contains("httponly", cookie);
        var options = host.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>().Get(PlatformAuthentication.Scheme);
        Assert.False(options.SlidingExpiration); Assert.Equal(TimeSpan.FromHours(8), options.ExpireTimeSpan);
    }

    [Fact]
    public void Production_MissingOrRelativeKeyDirectory_FailsExplicitly()
    {
        var environment = new HostingEnvironment { EnvironmentName = "Production" };
        Assert.Throws<InvalidOperationException>(() => DeploymentConfiguration.ValidateKeyRing(new ConfigurationBuilder().Build(), environment));
        var relative = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        { ["DataProtection:KeyRingPath"] = "relative/keys" }).Build();
        Assert.Throws<InvalidOperationException>(() => DeploymentConfiguration.ValidateKeyRing(relative, environment));
    }

    private sealed class HostingEnvironment : IWebHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Production";
        public string ApplicationName { get; set; } = "Tests";
        public string ContentRootPath { get; set; } = "/tmp";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = "/tmp";
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
    }
}
