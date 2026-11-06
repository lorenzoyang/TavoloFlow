using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using TavoloFlow.Api.Operations;

namespace TavoloFlow.Api.Tests;

public sealed class DeploymentHostingTests
{
    [Theory]
    [InlineData("10.20.0.2", "10.20.0.2", "https", "198.51.100.7")]
    [InlineData("10.20.0.2", "::ffff:10.20.0.2", "https", "198.51.100.7")]
    [InlineData("10.20.0.2", "10.20.0.3", "http", "10.20.0.3")]
    [InlineData(null, "10.20.0.2", "http", "10.20.0.2")]
    public async Task ForwardedHeaders_TrustsOnlyConfiguredPeer(
        string? trusted,
        string peer,
        string expectedScheme,
        string expectedIp
    )
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        if (trusted is not null)
            builder.Configuration["ReverseProxy:KnownProxies:0"] = trusted;
        builder.Services.AddDeploymentHosting(builder.Configuration);
        await using var app = builder.Build();
        app.Use(
            (context, next) =>
            {
                context.Connection.RemoteIpAddress = IPAddress.Parse(peer);
                return next(context);
            }
        );
        app.UseForwardedHeaders();
        app.MapGet(
            "/probe",
            (Microsoft.AspNetCore.Http.HttpContext context) =>
                new Probe(context.Request.Scheme, context.Connection.RemoteIpAddress!.ToString())
        );
        await app.StartAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Forwarded-Proto", "http, https");
        client.DefaultRequestHeaders.Add("X-Forwarded-For", "203.0.113.99, 198.51.100.7");
        var response = await client.GetFromJsonAsync<Probe>("/probe");
        Assert.Equal(new Probe(expectedScheme, expectedIp), response);
    }

    private sealed record Probe(string Scheme, string Ip);
}

public sealed class ReadinessTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    [Fact]
    public async Task Readiness_ProductionHttpProbe_ReturnsNoDatabaseDetailsOrRedirect()
    {
        await using var host = new AccountTestHost(database, production: true);
        using var browser = host.CreateClient(
            new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
            {
                BaseAddress = new Uri("http://localhost"),
                AllowAutoRedirect = false,
            }
        );
        var response = await browser.GetAsync("/health/ready");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync());
        Assert.Contains("no-store", response.Headers.CacheControl!.ToString());
    }

    [Fact]
    public async Task Readiness_UnreachableDatabase_ReturnsServiceUnavailable()
    {
        await using var host = new AccountTestHost(database, production: true);
        await using var unavailable = host.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
            {
                services.AddScoped(_ => new TavoloFlow.Api.Data.ApplicationDbContext(
                    new Microsoft.EntityFrameworkCore.DbContextOptionsBuilder<TavoloFlow.Api.Data.ApplicationDbContext>()
                        .UseNpgsql(
                            "Host=127.0.0.1;Port=1;Database=unavailable;Username=probe;Password=not-a-secret;Timeout=1"
                        )
                        .Options
                ));
            })
        );
        using var browser = unavailable.CreateClient();
        var response = await browser.GetAsync("/health/ready");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("Unhealthy", await response.Content.ReadAsStringAsync());
    }
}
