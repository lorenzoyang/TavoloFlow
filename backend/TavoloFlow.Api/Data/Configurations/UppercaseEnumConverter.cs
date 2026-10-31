using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using TavoloFlow.Api.Common;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class UppercaseEnumConverter<TEnum> : ValueConverter<TEnum, string>
    where TEnum : struct, Enum
{
    public UppercaseEnumConverter()
        : base(
            value => ApiEnum.Text(value),
            value => Enum.Parse<TEnum>(value.Replace("_", ""), ignoreCase: true))
    {
    }
}