using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace TavoloFlow.Api.Common;

// Keyset pagination. A cursor is the Base64Url JSON of the last row's sort key plus the scope it was
// issued for (tenant, session, filters...); each service checks that scope before trusting the position.
// Unlike OFFSET, a value-based position stays correct when rows are added or leave the list.
public static class Paging
{
    public const int MaxLimit = 100;
    private const int MaxCursorLength = 2048;

    public static void EnsureLimit(int limit)
    {
        if (limit is < 1 or > MaxLimit)
        {
            throw ApiException.Validation("每页数量须为 1–100。", "limit", "每页数量须为 1–100。");
        }
    }

    // Returns null when no cursor was sent. A malformed or out-of-scope cursor is a client error.
    // isValid is the calling service's scope check; the cursor is client input and never trusted as sent.
    public static T? Decode<T>(string? cursor, Func<T, bool>? isValid = null) where T : class
    {
        if (cursor is null) return null;
        T? value;
        try
        {
            if (cursor.Length > MaxCursorLength) throw new FormatException();
            value = JsonSerializer.Deserialize<T>(WebEncoders.Base64UrlDecode(cursor));
        }
        catch (Exception error) when (error is FormatException or JsonException or ArgumentException)
        {
            throw InvalidCursor();
        }
        if (value is null || (isValid is not null && !isValid(value))) throw InvalidCursor();
        return value;
    }

    public static ApiException InvalidCursor() =>
        ApiException.Validation("分页位置无效，请重新读取。", "cursor", "分页位置无效，请重新读取。");

    // A position is a UTC timestamp, as PostgreSQL returns it, plus a non-empty ID that breaks ties.
    public static bool IsPosition(DateTime at, Guid id) => at.Kind == DateTimeKind.Utc && id != Guid.Empty;

    // Callers read limit + 1 rows; the extra row only proves that another page exists.
    // The cursor records the last returned row, since the next page starts strictly after it.
    public static (T[] Items, string? NextCursor) Page<T, TCursor>(T[] rows, int limit, Func<T, TCursor> cursorFor)
    {
        var items = rows.Take(limit).ToArray();
        var next = rows.Length > limit
            ? WebEncoders.Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(cursorFor(items[^1])))
            : null;
        return (items, next);
    }
}
