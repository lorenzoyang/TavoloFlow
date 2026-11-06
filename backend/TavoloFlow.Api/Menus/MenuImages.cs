using SkiaSharp;

namespace TavoloFlow.Api.Menus;

// Every dish photo is decoded and re-encoded here. The server never serves the uploaded bytes, so a crafted
// file cannot become same-origin content, and the stored WebP carries no EXIF (GPS) or other metadata.
internal static class MenuImages
{
    public const int MaxUploadBytes = 15 * 1024 * 1024;

    // Bounds decoding memory independently of the compressed size; a 48 MP phone photo still fits.
    private const long MaxPixels = 50_000_000;
    private const int Side = 640;
    private const int Quality = 80;
    private static readonly SKEncodedImageFormat[] Accepted =
    [
        SKEncodedImageFormat.Jpeg,
        SKEncodedImageFormat.Png,
        SKEncodedImageFormat.Webp,
    ];

    // Runs before the menu write transaction, so no row lock waits on decoding.
    public static async Task<byte[]> EncodeAsync(Stream body, long? length, CancellationToken ct)
    {
        if (length > MaxUploadBytes)
            throw MenuErrors.ImageTooLarge();
        var upload = await ReadAsync(body, ct);
        using var data = SKData.CreateCopy(upload);
        using var codec = SKCodec.Create(data);
        if (codec is null || !Accepted.Contains(codec.EncodedFormat))
            throw MenuErrors.ImageInvalid();
        if ((long)codec.Info.Width * codec.Info.Height > MaxPixels)
            throw MenuErrors.ImageTooLarge();
        using var decoded = Decode(codec);
        return Square(decoded, codec.EncodedOrigin);
    }

    // JPEG decodes directly at a reduced scale, so a large photo never expands to full size in memory.
    // Pixels are converted to sRGB because the stored image keeps no colour profile.
    private static SKImage Decode(SKCodec codec)
    {
        var shorter = Math.Min(codec.Info.Width, codec.Info.Height);
        var size = codec.GetScaledDimensions(Math.Min(1f, Side * 2f / shorter));
        var info = new SKImageInfo(
            size.Width,
            size.Height,
            SKColorType.Rgba8888,
            SKAlphaType.Premul,
            SKColorSpace.CreateSrgb()
        );
        using var bitmap = new SKBitmap(info);
        if (codec.GetPixels(info, bitmap.GetPixels()) != SKCodecResult.Success)
            throw MenuErrors.ImageInvalid();
        return SKImage.FromBitmap(bitmap);
    }

    // Applies the EXIF orientation, crops the centred square and scales it to Side x Side in one draw.
    private static byte[] Square(SKImage image, SKEncodedOrigin origin)
    {
        var (w, h) = (image.Width, image.Height);
        var turned =
            origin
            is SKEncodedOrigin.LeftTop
                or SKEncodedOrigin.RightTop
                or SKEncodedOrigin.RightBottom
                or SKEncodedOrigin.LeftBottom;
        var (width, height) = turned ? (h, w) : (w, h);
        var side = Math.Min(width, height);
        using var surface = SKSurface.Create(
            new SKImageInfo(
                Side,
                Side,
                SKColorType.Rgba8888,
                SKAlphaType.Premul,
                SKColorSpace.CreateSrgb()
            )
        );
        var canvas = surface.Canvas;
        canvas.Clear(SKColors.Transparent);
        canvas.Scale((float)Side / side);
        canvas.Translate(-(width - side) / 2f, -(height - side) / 2f);
        canvas.Concat(Orientation(origin, w, h));
        canvas.DrawImage(
            image,
            0,
            0,
            new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear)
        );
        using var snapshot = surface.Snapshot();
        using var encoded = snapshot.Encode(SKEncodedImageFormat.Webp, Quality);
        return encoded.ToArray();
    }

    // Maps the stored pixel grid (w x h) onto the upright picture, per the eight EXIF orientations.
    private static SKMatrix Orientation(SKEncodedOrigin origin, float w, float h) =>
        origin switch
        {
            SKEncodedOrigin.TopRight => new(-1, 0, w, 0, 1, 0, 0, 0, 1),
            SKEncodedOrigin.BottomRight => new(-1, 0, w, 0, -1, h, 0, 0, 1),
            SKEncodedOrigin.BottomLeft => new(1, 0, 0, 0, -1, h, 0, 0, 1),
            SKEncodedOrigin.LeftTop => new(0, 1, 0, 1, 0, 0, 0, 0, 1),
            SKEncodedOrigin.RightTop => new(0, -1, h, 1, 0, 0, 0, 0, 1),
            SKEncodedOrigin.RightBottom => new(0, -1, h, -1, 0, w, 0, 0, 1),
            SKEncodedOrigin.LeftBottom => new(0, 1, 0, -1, 0, w, 0, 0, 1),
            _ => SKMatrix.Identity,
        };

    // Stops reading just past the limit instead of letting Kestrel fail the request with a generic error.
    private static async Task<byte[]> ReadAsync(Stream body, CancellationToken ct)
    {
        using var buffer = new MemoryStream();
        var chunk = new byte[81_920];
        int read;
        while ((read = await body.ReadAsync(chunk, ct)) > 0)
        {
            if (buffer.Length + read > MaxUploadBytes)
                throw MenuErrors.ImageTooLarge();
            buffer.Write(chunk, 0, read);
        }
        return buffer.ToArray();
    }
}
