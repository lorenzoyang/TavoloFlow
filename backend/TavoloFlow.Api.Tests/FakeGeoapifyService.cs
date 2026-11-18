using System.Collections.Concurrent;
using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.WebUtilities;
using TavoloFlow.Api.Online;

namespace TavoloFlow.Api.Tests;

// Stands in for Geoapify: answers the address search from Places and the drive route with the place's
// road distance. To keep the route lookup simple, a place's latitude is its distance in metres.
public sealed class FakeGeoapifyService : HttpMessageHandler
{
    public sealed record Place(string Type, double StreetConfidence, string? City, int Meters);

    public ConcurrentDictionary<string, Place> Places { get; } = new();
    public ConcurrentQueue<Uri> Calls { get; } = new();

    // Answers every request with this status instead, like an outage.
    public HttpStatusCode? Failure { get; set; }

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
                    ? new object[]
                    {
                        new
                        {
                            result_type = place.Type,
                            city = place.City,
                            lat = (double)place.Meters,
                            lon = 11.0,
                            rank = new { confidence_street_level = place.StreetConfidence },
                        },
                    }
                    : [],
            },
            "/v1/routing" => new
            {
                results = new[]
                {
                    new
                    {
                        distance = double.Parse(
                            query["waypoints"].ToString().Split('|')[1].Split(',')[0],
                            CultureInfo.InvariantCulture
                        ),
                    },
                },
            },
            _ => throw new InvalidOperationException(
                $"Unexpected Geoapify path {uri.AbsolutePath}."
            ),
        };
        return Task.FromResult(
            new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(body) }
        );
    }
}
