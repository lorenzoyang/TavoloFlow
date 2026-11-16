using System.Collections.Concurrent;
using Microsoft.AspNetCore.WebUtilities;

namespace TavoloFlow.Api.Tests;

public sealed class FakeTurnstileService : HttpMessageHandler
{
    public ConcurrentQueue<(string Token, string Secret)> Calls { get; } = new();
    public Func<string, CancellationToken, Task<HttpResponseMessage>> Respond { get; set; } =
        (_, _) =>
            Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.ServiceUnavailable));

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken ct
    )
    {
        if (request.RequestUri?.ToString() != TavoloFlow.Api.Online.OnlineVerification.Endpoint)
            throw new InvalidOperationException("Unexpected verification endpoint.");
        var form = QueryHelpers.ParseQuery(await request.Content!.ReadAsStringAsync(ct));
        var token = form["response"].ToString();
        Calls.Enqueue((token, form["secret"].ToString()));
        return await Respond(token, ct);
    }
}
