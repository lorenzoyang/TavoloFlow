using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class UppercaseEnumConverter<TEnum> : ValueConverter<TEnum, string>
    where TEnum : struct, Enum
{
    public UppercaseEnumConverter()
        : base(
            value => value.ToString().ToUpperInvariant(),
            value => Enum.Parse<TEnum>(value, ignoreCase: true))
    {
    }
}