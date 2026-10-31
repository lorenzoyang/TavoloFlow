using System.Text;

namespace TavoloFlow.Api.Common;

// Enums travel as uppercase names in JSON and in PostgreSQL columns, with words split by underscores:
// Paid is "PAID", DineIn is "DINE_IN".
public static class ApiEnum
{
    public static string Text<TEnum>(TEnum value) where TEnum : struct, Enum
    {
        var name = value.ToString();
        var text = new StringBuilder(name.Length + 2);
        for (var i = 0; i < name.Length; i++)
        {
            if (i > 0 && char.IsUpper(name[i]) && char.IsLower(name[i - 1])) text.Append('_');
            text.Append(char.ToUpperInvariant(name[i]));
        }
        return text.ToString();
    }

    // Accepts only an exact defined name such as "READY" or "DINE_IN": not "ready", "DINEIN", "1" or " READY".
    public static bool TryParse<TEnum>(string? text, out TEnum value) where TEnum : struct, Enum =>
        Enum.TryParse(text?.Replace("_", ""), ignoreCase: true, out value) && Enum.IsDefined(value) && Text(value) == text;
}
