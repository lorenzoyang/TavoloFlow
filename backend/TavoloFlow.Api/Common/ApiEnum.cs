using System.Text;

namespace TavoloFlow.Api.Common;

// Enums travel as uppercase names in JSON and in PostgreSQL columns, with an underscore between the words
// of a multi-word name: PAID, DINE_IN, NO_SHOW.
public static class ApiEnum
{
    public static string Text<TEnum>(TEnum value)
        where TEnum : struct, Enum
    {
        var name = value.ToString();
        var text = new StringBuilder(name.Length + 4);
        foreach (var (letter, index) in name.Select((letter, index) => (letter, index)))
        {
            if (index > 0 && char.IsUpper(letter))
                text.Append('_');
            text.Append(char.ToUpperInvariant(letter));
        }
        return text.ToString();
    }

    // Accepts only an exact defined name such as "READY" or "DINE_IN": not "ready", "DINEIN", "1" or " READY".
    public static bool TryParse<TEnum>(string? text, out TEnum value)
        where TEnum : struct, Enum =>
        Enum.TryParse(text?.Replace("_", ""), ignoreCase: true, out value)
        && Enum.IsDefined(value)
        && Text(value) == text;

    // The reverse of Text for values read back from the database, which only ever stores Text's output.
    public static TEnum Parse<TEnum>(string text)
        where TEnum : struct, Enum => Enum.Parse<TEnum>(text.Replace("_", ""), ignoreCase: true);
}
