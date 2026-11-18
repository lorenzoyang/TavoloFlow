using System.ComponentModel.DataAnnotations;
using System.Data;
using System.Globalization;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Data.Configurations;

namespace TavoloFlow.Api.Online;

// Automatic delivery quotes through Geoapify. Without an API key they are off everywhere: checkout
// shows the price list and whoever accepts picks the band, exactly as without this feature.
public sealed class GeoapifyOptions
{
    public const string Section = "Geoapify";
    public string? ApiKey { get; set; }

    // Geoapify's free credits are a soft limit: overuse is not refused but may restrict the account,
    // stopping every restaurant's quotes. The site-wide cap stays below what the credits cover (two per
    // quote); the per-restaurant cap stops one restaurant being drained from using everyone's.
    [Range(1, 100_000)]
    public int DailyQuotesPerRestaurant { get; set; } = 200;

    [Range(1, 100_000)]
    public int DailyQuotes { get; set; } = 1200;

    public bool Enabled => !string.IsNullOrWhiteSpace(ApiKey);
}

internal sealed class GeoapifyOptionsValidator : IValidateOptions<GeoapifyOptions>
{
    public ValidateOptionsResult Validate(string? name, GeoapifyOptions options)
    {
        if (!options.Enabled)
            return ValidateOptionsResult.Success;
        var key = options.ApiKey!.Trim();
        return
            key.Length is >= 10 and <= 256
            && !key.Any(char.IsWhiteSpace)
            && !key.Contains("REPLACE", StringComparison.OrdinalIgnoreCase)
            && !key.Contains("YOUR_", StringComparison.OrdinalIgnoreCase)
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(
                "Set Geoapify:ApiKey to a complete key, or leave it empty to turn automatic delivery quotes off."
            );
    }
}

// Process-local daily caps, checked just before calling Geoapify. Each window lasts a day from its first
// quote and restarts with the process; reaching a cap only means the price list until it reopens.
public sealed class DeliveryQuoteLimits(IOptions<GeoapifyOptions> options) : IDisposable
{
    private static readonly TimeSpan Day = TimeSpan.FromDays(1);
    private readonly FixedWindowLimiter perRestaurant = new(
        options.Value.DailyQuotesPerRestaurant,
        Day
    );
    private readonly FixedWindowLimiter overall = new(options.Value.DailyQuotes, Day);

    public bool TryAcquire(Guid restaurantId) =>
        perRestaurant.TryAcquire(restaurantId.ToString()) is null
        && overall.TryAcquire("all") is null;

    public void Dispose()
    {
        perRestaurant.Dispose();
        overall.Dispose();
    }
}

// Where an address is and how far by road: the town to show and the driving distance in metres.
public sealed record RoutedAddress(string? Town, int Meters);

public interface IDeliveryRouting
{
    bool Enabled { get; }

    // Null when the address can't be priced: not found precisely enough, or the service failed.
    Task<RoutedAddress?> RouteAsync(
        decimal originLat,
        decimal originLng,
        string address,
        int radiusMeters,
        CancellationToken ct
    );
}

// One address search and one drive route per quote (two credits). The key travels in the URL, so the
// named HttpClient has no loggers; failures log only the HTTP status or the exception type, never the
// address, the key, coordinates or a response body. Traffic is the default free flow, so the same
// address keeps the same price. The EU endpoint is the one Geoapify's DPA keeps inside the EU.
public sealed class GeoapifyRouting(
    IHttpClientFactory clients,
    IOptions<GeoapifyOptions> options,
    ILogger<GeoapifyRouting> logger
) : IDeliveryRouting
{
    public const string HttpClientName = "geoapify";
    public const string Endpoint = "https://api-eu.geoapify.com";

    public bool Enabled => options.Value.Enabled;

    public async Task<RoutedAddress?> RouteAsync(
        decimal originLat,
        decimal originLng,
        string address,
        int radiusMeters,
        CancellationToken ct
    )
    {
        if (!Enabled)
            return null;
        var key = Uri.EscapeDataString(options.Value.ApiKey!.Trim());
        var lat = originLat.ToString(CultureInfo.InvariantCulture);
        var lng = originLng.ToString(CultureInfo.InvariantCulture);
        var client = clients.CreateClient(HttpClientName);
        try
        {
            // The search takes longitude first; the route takes latitude first.
            var found = await GetAsync<SearchResponse>(
                client,
                $"{Endpoint}/v1/geocode/search?text={Uri.EscapeDataString(address)}"
                    + $"&filter=circle:{lng},{lat},{radiusMeters}&bias=proximity:{lng},{lat}"
                    + $"&limit=1&format=json&apiKey={key}",
                ct
            );
            // A malformed answer (a missing point, a missing or impossible distance) is not priced
            // either; an impossible point fails the route.
            var match = found?.Results?.FirstOrDefault();
            if (
                match is not { Lat: not null, Lon: not null }
                || !OnlineDelivery.QuotableMatches.Contains(match.ResultType)
                || (match.Rank?.ConfidenceStreetLevel ?? 0) < OnlineDelivery.MinStreetConfidence
            )
                return null;
            var waypoints = string.Create(
                CultureInfo.InvariantCulture,
                $"{lat},{lng}|{match.Lat},{match.Lon}"
            );
            var route = await GetAsync<RouteResponse>(
                client,
                $"{Endpoint}/v1/routing?waypoints={Uri.EscapeDataString(waypoints)}"
                    + $"&mode=drive&format=json&apiKey={key}",
                ct
            );
            if (
                route?.Results?.FirstOrDefault()?.Distance is not { } distance
                || distance is not (>= 0 and <= int.MaxValue)
            )
                return null;
            return new(match.City, (int)Math.Max(1, Math.Round(distance)));
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception error)
            when (error
                    is HttpRequestException
                        or OperationCanceledException
                        or JsonException
                        or NotSupportedException
                        or IOException
            )
        {
            logger.LogWarning(
                "Delivery quote service unavailable ({ErrorType}).",
                error.GetType().Name
            );
            return null;
        }
    }

    private async Task<T?> GetAsync<T>(HttpClient client, string url, CancellationToken ct)
        where T : class
    {
        using var response = await client.GetAsync(url, ct);
        if (response.IsSuccessStatusCode)
            return await response.Content.ReadFromJsonAsync<T>(ct);
        logger.LogWarning(
            "Delivery quote service answered HTTP {Status}.",
            (int)response.StatusCode
        );
        return null;
    }

    private sealed record SearchResponse(SearchResult[]? Results);

    private sealed record SearchResult(
        [property: JsonPropertyName("result_type")] string? ResultType,
        string? City,
        double? Lat,
        double? Lon,
        SearchRank? Rank
    );

    private sealed record SearchRank(
        [property: JsonPropertyName("confidence_street_level")] double? ConfidenceStreetLevel
    );

    private sealed record RouteResponse(RouteLeg[]? Results);

    private sealed record RouteLeg(double? Distance);
}

// A quote is signed with purpose-bound Data Protection, like join codes: the purpose names the
// restaurant, and the payload holds the normalized address, the restaurant's starting point, the road
// distance and the expiry. The submission checks it without calling Geoapify again, and the customer
// cannot forge or reuse it; a moved starting point, like changed bands, makes it stale.
public sealed class DeliveryQuotes(IDataProtectionProvider protection)
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(30);

    private IDataProtector Protector(Guid restaurantId) =>
        protection.CreateProtector("TavoloFlow.Online.DeliveryQuote.v1", restaurantId.ToString());

    public string Sign(
        Guid restaurantId,
        string address,
        decimal originLat,
        decimal originLng,
        int meters,
        DateTime expiresAt
    ) =>
        Protector(restaurantId)
            .Protect(
                JsonSerializer.Serialize(
                    new Payload(address, originLat, originLng, meters, expiresAt.Ticks)
                )
            );

    // The quoted road distance when the quote is this restaurant's, for this address from this
    // starting point and still valid at now (from TimeProvider); null otherwise.
    public int? Distance(
        Guid restaurantId,
        string address,
        decimal? originLat,
        decimal? originLng,
        string quote,
        DateTime now
    )
    {
        try
        {
            var payload = JsonSerializer.Deserialize<Payload>(
                Protector(restaurantId).Unprotect(quote)
            );
            return
                payload is not null
                && payload.Address == OnlineDelivery.NormalizeAddress(address)
                && payload.OriginLat == originLat
                && payload.OriginLng == originLng
                && now.Ticks < payload.ExpiresTicks
                ? payload.Meters
                : null;
        }
        catch (Exception error) when (error is CryptographicException or JsonException)
        {
            return null;
        }
    }

    private sealed record Payload(
        string Address,
        decimal OriginLat,
        decimal OriginLng,
        int Meters,
        long ExpiresTicks
    );
}

// The checkout's fee request. Restaurant, hours and bands are read in one short snapshot that ends
// before Geoapify is called, so no transaction waits on the network.
public sealed class DeliveryQuoteService(
    ApplicationDbContext db,
    TimeProvider clock,
    IDeliveryRouting routing,
    DeliveryQuotes quotes,
    DeliveryQuoteLimits limits
)
{
    private static readonly DeliveryQuoteResponse Unknown = new(DeliveryQuoteResponse.Unknown);

    public async Task<DeliveryQuoteResponse> QuoteAsync(
        string slug,
        DeliveryQuoteInput input,
        CancellationToken ct
    )
    {
        if (!InputRules.IsSlug(slug))
            throw OnlineErrors.LinkNotFound();
        var address = OnlineDelivery.NormalizeAddress(input.Address);
        if (address is null || address.Length > OnlineRequestConfiguration.MaxDeliveryAddressLength)
            throw ApiException.Validation(
                "Enter an address of at most 200 characters.",
                "address",
                "Invalid address."
            );
        var now = clock.GetUtcNow();
        Entities.Restaurant restaurant;
        OnlineAvailabilityResult availability;
        DeliveryTierResponse[] tiers;
        await using (
            var transaction = await db.Database.BeginTransactionAsync(
                IsolationLevel.RepeatableRead,
                ct
            )
        )
        {
            restaurant =
                await db.Restaurants.AsNoTracking().SingleOrDefaultAsync(r => r.Slug == slug, ct)
                ?? throw OnlineErrors.LinkNotFound();
            (_, availability) = await OnlineAvailability.ReadAsync(db, restaurant, now, ct);
            tiers = await OnlineDelivery.TiersAsync(db, restaurant.Id, ct);
            await transaction.CommitAsync(ct);
        }
        // Only while customers can order delivery; the caps are counted last, just before the call.
        if (
            !availability.IsOpen
            || !restaurant.DeliveryEnabled
            || !AutoQuote(restaurant, tiers)
            || !limits.TryAcquire(restaurant.Id)
        )
            return Unknown;
        var originLat = restaurant.DeliveryOriginLat!.Value;
        var originLng = restaurant.DeliveryOriginLng!.Value;
        var routed = await routing.RouteAsync(
            originLat,
            originLng,
            address,
            tiers[^1].MaxMeters + OnlineDelivery.SearchMarginMeters,
            ct
        );
        if (routed is null)
            return Unknown;
        if (OnlineDelivery.TierFee(tiers, routed.Meters) is not { } fee)
            return new(DeliveryQuoteResponse.OutOfRange);
        return new(
            DeliveryQuoteResponse.Quoted,
            routed.Town,
            routed.Meters,
            fee,
            quotes.Sign(
                restaurant.Id,
                address,
                originLat,
                originLng,
                routed.Meters,
                now.UtcDateTime + DeliveryQuotes.Lifetime
            )
        );
    }

    // Whether checkout can ask for a quote: a key, the restaurant's starting point and its bands.
    public bool AutoQuote(Entities.Restaurant restaurant, DeliveryTierResponse[] tiers) =>
        routing.Enabled && restaurant.DeliveryOriginLat is not null && tiers.Length > 0;
}
