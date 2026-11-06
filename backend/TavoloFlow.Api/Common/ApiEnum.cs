namespace TavoloFlow.Api.Common;

// Enums travel as uppercase names ("PAID") in JSON and in PostgreSQL columns.
public static class ApiEnum
{
    public static string Text<TEnum>(TEnum value)
        where TEnum : struct, Enum => value.ToString().ToUpperInvariant();

    // Accepts only an exact defined name such as "READY": not "ready", "1" or " READY".
    public static bool TryParse<TEnum>(string? text, out TEnum value)
        where TEnum : struct, Enum =>
        Enum.TryParse(text, ignoreCase: true, out value)
        && Enum.IsDefined(value)
        && Text(value) == text;
}
