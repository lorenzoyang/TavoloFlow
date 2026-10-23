using Microsoft.AspNetCore.Diagnostics;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Menus;
using TavoloFlow.Api.Tables;
using TavoloFlow.Api.Guests;
using TavoloFlow.Api.Ordering;
using TavoloFlow.Api.Kitchen;
using TavoloFlow.Api.Billing;
using TavoloFlow.Api.Platform;
using TavoloFlow.Api.Operations;

if (args is ["--healthcheck"])
{
    try
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        using var response = await client.GetAsync("http://127.0.0.1:8080/api/health/ready");
        Environment.ExitCode = response.IsSuccessStatusCode ? 0 : 1;
    }
    catch (HttpRequestException) { Environment.ExitCode = 1; }
    catch (TaskCanceledException) { Environment.ExitCode = 1; }
    return;
}

string[] commandFlags = ["--seed-dev-accounts", "--seed-platform-admin", "--reset-platform-password"];
var commands = args.Where(arg => commandFlags.Contains(arg, StringComparer.Ordinal)).ToArray();
if (commands.Length > 1) throw new InvalidOperationException("Run one initialization or recovery command at a time.");
var seedAccounts = commands.Contains("--seed-dev-accounts");
var builder = WebApplication.CreateBuilder(args.Where(arg => !commandFlags.Contains(arg, StringComparer.Ordinal)).ToArray());
builder.Configuration.AddKeyPerFile("/run/secrets", optional: true);

builder.Services.AddControllers(options =>
{
    options.Filters.Add<CsrfValidationFilter>();
    options.Filters.Add<ApiExceptionFilter>();
});
builder.Services.AddDataLayer(builder.Configuration);
builder.Services.AddStoreAccounts(builder.Configuration, builder.Environment);
builder.Services.AddDiningAndGuests(builder.Configuration, builder.Environment);
builder.Services.AddPlatformAccounts(builder.Configuration, builder.Environment);
builder.Services.AddScoped<RestaurantAdministration>();
builder.Services.AddScoped<OrderService>();
builder.Services.AddScoped<KitchenService>();
builder.Services.AddScoped<BillingService>();
builder.Services.AddScoped<MenuService>();
builder.Services.AddScoped<TableService>();
builder.Services.AddScoped<PublicMenuService>();
builder.Services.AddDeployment(builder.Configuration);
builder.Services.AddOpenApi();

var app = builder.Build();

if (commands.Contains("--seed-platform-admin") || commands.Contains("--reset-platform-password"))
{
    await using var scope = app.Services.CreateAsyncScope();
    var options = builder.Configuration.GetSection("PlatformBootstrap").Get<PlatformBootstrapOptions>() ?? new();
    var changed = await scope.ServiceProvider.GetRequiredService<PlatformBootstrap>()
        .RunAsync(options, commands.Contains("--reset-platform-password"));
    app.Logger.LogInformation(changed ? "Platform command completed." : "Platform administrator already exists; unchanged.");
    return;
}

if (seedAccounts)
{
    await using var scope = app.Services.CreateAsyncScope();
    var options = builder.Configuration.GetSection("DevelopmentSeed").Get<DevelopmentSeedOptions>() ?? new();
    var created = await scope.ServiceProvider.GetRequiredService<DevelopmentAccountSeeder>().SeedAsync(options);
    app.Logger.LogInformation(created ? "Development accounts created." : "Development accounts already exist; unchanged.");
    return;
}

DeploymentConfiguration.ValidateKeyRing(builder.Configuration, app.Environment);

app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        context.Response.Headers.CacheControl = "no-store";
    }
    await next();
});
app.UseExceptionHandler(handler => handler.Run(async context =>
{
    var exception = context.Features.Get<IExceptionHandlerFeature>()?.Error;
    app.Logger.LogError(exception, "Request {RequestId} failed.", context.TraceIdentifier);
    context.Response.StatusCode = StatusCodes.Status500InternalServerError;
    context.Response.Headers.CacheControl = "no-store";
    await context.Response.WriteAsJsonAsync(ApiError.Create(context, "INTERNAL_ERROR", "服务暂时不可用，请稍后重试。"));
}));

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi().AllowAnonymous();
}
else
{
    app.UseForwardedHeaders();
    app.UseHsts();
    // The internal container health probe uses HTTP; no sensitive data is returned.
    app.UseWhen(context => !context.Request.Path.StartsWithSegments("/api/health"), branch => branch.UseHttpsRedirection());
}

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();

public partial class Program;
