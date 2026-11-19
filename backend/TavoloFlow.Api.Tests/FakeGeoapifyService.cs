using System.Collections.Concurrent;
using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.WebUtilities;
using TavoloFlow.Api.Online;

namespace TavoloFlow.Api.Tests;

// Stands in for Geoapify: answers the address search from Places and the drive route with the place's
// road distance. A place lies due north of the searched point by its metres, so its straight-line and
// road distances are equal: the search's circle leaves out places farther than its radius, and the
// route reads the distance back from the latitudes. A place without metres is answered without
// coordinates, like a malformed response.
public sealed class FakeGeoapifyService : HttpMessageHandler
{
    private static readonly double MetersPerDegree =
        OnlineDelivery.EarthRadiusMeters * Math.PI / 180;

    public sealed record Place(string Type, double StreetConfidence, string? City, int? Meters);

    public ConcurrentDictionary<string, Place> Places { get; } = new();
    public ConcurrentQueue<Uri> Calls { get; } = new();

    // Answers every request with this status instead, like an outage.
    public HttpStatusCode? Failure { get; set; }

    // Answers the route without its distance, like a malformed response.
    public bool RouteWithoutDistance { get; set; }

    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken ct
    )
    {
        var uri = request.RequestUri!;
        if (uri.GetLeftPart(UriPartial.Authority) != GeoapifyRouting.Endpoint)
            throw new InvalidOperationException("Unexpected Geoapify endpoint.");
        Calls.Enqueue(uri);
        if (Failure is { } status)
            return Task.FromResult(new HttpResponseMessage(status));
        var query = QueryHelpers.ParseQuery(uri.Query);
        object body = uri.AbsolutePath switch
        {
            "/v1/geocode/search" => new
            {
                results = Places.TryGetValue(query["text"].ToString(), out var place)
                && !(
                    query.TryGetValue("filter", out var filter)
                    && OutsideCircle(filter.ToString(), place)
                )
                    ? new object[]
                    {
                        place.Meters is { } meters
                            ? (object)
                                new
                                {
                                    result_type = place.Type,
                                    city = place.City,
                                    lat = Origin(query["bias"].ToString()).Lat
                                        + meters / MetersPerDegree,
                                    lon = Origin(query["bias"].ToString()).Lng,
                                    rank = new { confidence_street_level = place.StreetConfidence },
                                }
                            : new
                            {
                                result_type = place.Type,
                                city = place.City,
                                rank = new { confidence_street_level = place.StreetConfidence },
                            },
                    }
                    : [],
            },
            "/v1/routing" => new
            {
                results = RouteWithoutDistance
                    ? new object[] { new { } }
                    : [new { distance = RouteMeters(query["waypoints"].ToString()) }],
            },
            _ => throw new InvalidOperationException(
                $"Unexpected Geoapify path {uri.AbsolutePath}."
            ),
        };
        return Task.FromResult(
            new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(body) }
        );
    }

    // "proximity:lng,lat", the restaurant's point.
    private static (double Lat, double Lng) Origin(string bias)
    {
        var parts = bias["proximity:".Length..].Split(',');
        return (Number(parts[1]), Number(parts[0]));
    }

    // "circle:lng,lat,radius"; a place without metres has no point and always matches.
    private static bool OutsideCircle(string filter, Place place) =>
        filter.StartsWith("circle:", StringComparison.Ordinal)
        && place.Meters is { } meters
        && Math.Abs(meters) > Number(filter.Split(',')[2]);

    // "lat,lng|lat,lng": the destination's distance north of the origin.
    private static double RouteMeters(string waypoints)
    {
        var points = waypoints.Split('|');
        return (Number(points[1].Split(',')[0]) - Number(points[0].Split(',')[0]))
            * MetersPerDegree;
    }

    private static double Number(string value) => double.Parse(value, CultureInfo.InvariantCulture);
}
