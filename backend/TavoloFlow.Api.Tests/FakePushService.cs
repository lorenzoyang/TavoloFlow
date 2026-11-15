using System.Buffers.Binary;
using System.Buffers.Text;
using System.Collections.Concurrent;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace TavoloFlow.Api.Tests;

// What one push request carried to the push service.
public sealed record CapturedPush(
    Uri Endpoint,
    string? Authorization,
    string? Ttl,
    string? Urgency,
    string? ContentEncoding,
    byte[] Body
);

// Stands in for every browser push service: the host routes the push HttpClient here, so tests never
// reach the network. Respond chooses the status per endpoint (201 by default).
public sealed class FakePushService : HttpMessageHandler
{
    private readonly ConcurrentQueue<CapturedPush> requests = new();

    public Func<Uri, HttpStatusCode> Respond { get; set; } = _ => HttpStatusCode.Created;

    public CapturedPush[] Requests => [.. requests];

    public async Task<CapturedPush[]> WaitForAsync(int count)
    {
        for (var waited = 0; requests.Count < count && waited < 10_000; waited += 20)
            await Task.Delay(20);
        Assert.Equal(count, requests.Count);
        return Requests;
    }

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken ct
    )
    {
        var header = (string name) =>
            request.Headers.TryGetValues(name, out var values) ? string.Join(",", values) : null;
        requests.Enqueue(
            new(
                request.RequestUri!,
                request.Headers.Authorization?.ToString(),
                header("TTL"),
                header("Urgency"),
                string.Join(",", request.Content!.Headers.ContentEncoding),
                await request.Content.ReadAsByteArrayAsync(ct)
            )
        );
        return new HttpResponseMessage(Respond(request.RequestUri!));
    }

    // The host's HttpClientFactory may dispose expired handlers; this one lives with the host.
    protected override void Dispose(bool disposing) { }
}

// A browser subscription with its own key pair, able to read what was pushed to it.
public sealed class TestDevice : IDisposable
{
    private readonly ECDiffieHellman key = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256);
    private readonly byte[] auth = RandomNumberGenerator.GetBytes(16);

    public string Endpoint { get; } = PushSubscriptionTests.Fcm();

    private byte[] PublicKey
    {
        get
        {
            var point = key.ExportParameters(false).Q;
            return [0x04, .. point.X!, .. point.Y!];
        }
    }

    public object Body(string language = "zh") =>
        new
        {
            endpoint = Endpoint,
            p256dh = Base64Url.EncodeToString(PublicKey),
            auth = Base64Url.EncodeToString(auth),
            language,
        };

    // RFC 8291 decryption written from the specification, independent of the sending library: one
    // aes128gcm record (RFC 8188) keyed by ECDH with the server's ephemeral key and the auth secret.
    public JsonElement Read(CapturedPush push)
    {
        Assert.Equal(Endpoint, push.Endpoint.ToString());
        var body = push.Body;
        var salt = body[..16];
        var recordSize = BinaryPrimitives.ReadUInt32BigEndian(body.AsSpan(16, 4));
        var serverKey = body[21..(21 + body[20])];
        var ciphertext = body[(21 + body[20])..];
        Assert.Equal(65, serverKey.Length);
        Assert.True(ciphertext.Length <= recordSize);
        using var server = ECDiffieHellman.Create(
            new ECParameters
            {
                Curve = ECCurve.NamedCurves.nistP256,
                Q = new ECPoint { X = serverKey[1..33], Y = serverKey[33..] },
            }
        );
        var secret = key.DeriveRawSecretAgreement(server.PublicKey);
        var ikm = HKDF.DeriveKey(
            HashAlgorithmName.SHA256,
            secret,
            32,
            auth,
            [.. "WebPush: info\0"u8, .. PublicKey, .. serverKey]
        );
        var cek = HKDF.DeriveKey(
            HashAlgorithmName.SHA256,
            ikm,
            16,
            salt,
            "Content-Encoding: aes128gcm\0"u8.ToArray()
        );
        var nonce = HKDF.DeriveKey(
            HashAlgorithmName.SHA256,
            ikm,
            12,
            salt,
            "Content-Encoding: nonce\0"u8.ToArray()
        );
        var plain = new byte[ciphertext.Length - 16];
        using (var aes = new AesGcm(cek, 16))
            aes.Decrypt(nonce, ciphertext[..^16], ciphertext[^16..], plain);
        // The last record ends with the 0x02 delimiter and optional zero padding.
        var end = Array.FindLastIndex(plain, b => b != 0);
        Assert.Equal(2, plain[end]);
        return JsonDocument.Parse(Encoding.UTF8.GetString(plain, 0, end)).RootElement.Clone();
    }

    public void Dispose() => key.Dispose();
}
