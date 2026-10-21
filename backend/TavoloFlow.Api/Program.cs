using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.HttpOverrides;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Data;

var seedAccounts = args.Contains("--seed-dev-accounts", StringComparer.Ordinal);
var builder = WebApplication.CreateBuilder(args.Where(arg => arg != "--seed-dev-accounts").ToArray());

builder.Services.AddControllers(options => options.Filters.Add<CsrfValidationFilter>());
builder.Services.AddDataLayer(builder.Configuration);
builder.Services.AddStoreAccounts(builder.Configuration, builder.Environment);
builder.Services.Configure<ForwardedHeadersOptions>(options =>
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto);
builder.Services.AddOpenApi();

var app = builder.Build();

if (seedAccounts)
{
    await using var scope = app.Services.CreateAsyncScope();
    var options = builder.Configuration.GetSection("DevelopmentSeed").Get<DevelopmentSeedOptions>() ?? new();
    var created = await scope.ServiceProvider.GetRequiredService<DevelopmentAccountSeeder>().SeedAsync(options);
    app.Logger.LogInformation(created ? "Development accounts created." : "Development accounts already exist; unchanged.");
    return;
}

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
    // Keep the framework's loopback-only trusted proxies; never trust arbitrary forwarded headers.
    app.UseForwardedHeaders();
    app.UseHttpsRedirection();
}

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();

public partial class Program;
