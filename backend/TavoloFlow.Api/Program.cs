using Microsoft.AspNetCore.Diagnostics;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Billing;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Demo;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Guests;
using TavoloFlow.Api.Kitchen;
using TavoloFlow.Api.Menus;
using TavoloFlow.Api.Operations;
using TavoloFlow.Api.Ordering;
using TavoloFlow.Api.Platform;
using TavoloFlow.Api.Tables;

var command = MaintenanceCommands.Parse(args, out var hostArgs);
var builder = WebApplication.CreateBuilder(hostArgs);

builder.Services.AddSingleton(TimeProvider.System);
builder
    .Services.AddControllers(options =>
    {
        // Every write must carry its identity's CSRF token;
        options.Filters.Add<CsrfValidationFilter>();
        // every business error shares one JSON shape.
        options.Filters.Add<ApiExceptionFilter>();
    })
    // If the request body is malformed (bad GUID, unknown JSON field...), [ApiController] rejects it
    // with its own 400 before the action runs, and our exception filter never sees it.
    // This makes that automatic response use the same ApiError JSON as every other error.
    .ConfigureApiBehaviorOptions(options =>
        options.InvalidModelStateResponseFactory = ApiExceptionFilter.InvalidModelState
    );
builder.Services.AddOpenApi();
builder.Services.AddDataLayer(builder.Configuration);
builder.Services.AddDeploymentHosting(builder.Configuration);

// Three independent browser identities share one path-based authentication selector.
builder.Services.AddBrowserSecurity(builder.Configuration, builder.Environment);
builder.Services.AddStoreAccounts(builder.Configuration, builder.Environment);
builder.Services.AddGuestAccess(builder.Configuration, builder.Environment);
builder.Services.AddPlatformAccounts(builder.Configuration, builder.Environment);

// Business services are scoped: each request gets its own instance sharing the request's DbContext.
builder.Services.AddScoped<MenuService>();
builder.Services.AddScoped<MenuOptionService>();
builder.Services.AddScoped<PublicMenuService>();
builder.Services.AddScoped<TableService>();
builder.Services.AddSingleton<JoinCodes>();
builder.Services.AddScoped<DiningService>();
builder.Services.AddScoped<OrderService>();
builder.Services.AddScoped<KitchenService>();
builder.Services.AddScoped<BillingService>();
builder.Services.AddScoped<RestaurantAdministration>();
builder.Services.AddScoped<SubscriptionService>();
builder.Services.AddScoped<DemoSeeder>();

var app = builder.Build();

if (command is not null)
{
    await MaintenanceCommands.RunAsync(app, command);
    return;
}

app.UseForwardedHeaders();

// Docker probes this path from inside the container, over plain HTTP.
// Caddy blocks it at the public edge: only Docker needs it, not the public.
// This middleware comes before UseHsts and UseHttpsRedirection, so HTTPS rules never affect
// the plain-HTTP probe, and before UseAuthentication and UseAuthorization, because the probe
// carries no login cookie and the fallback policy would reject it with 401.
app.UseHealthChecks("/health/ready");

app.Use(
    async (context, next) =>
    {
        if (context.Request.Path.StartsWithSegments("/api"))
        {
            context.Response.Headers.CacheControl = "no-store";
        }
        await next();
    }
);

// Unified handling of unhandled exceptions.
// Tutte le eccezioni che non sono del tipo ApiException non vengono gestite dal filter ApiException filter,
// e i controllers non controllano le eccezioni (non catturano), quindi le eccezioni verrano propagate
app.UseExceptionHandler(handler =>
    handler.Run(async context =>
    {
        var exception = context.Features.Get<IExceptionHandlerFeature>()?.Error;

        app.Logger.LogError(exception, "Request {RequestId} failed.", context.TraceIdentifier);

        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.Headers.CacheControl = "no-store";

        await context.Response.WriteAsJsonAsync(
            ApiError.Create(
                context,
                "INTERNAL_ERROR",
                "The service is temporarily unavailable. Try again later."
            )
        );
    })
);

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi().AllowAnonymous();
}
else
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();

public partial class Program;
