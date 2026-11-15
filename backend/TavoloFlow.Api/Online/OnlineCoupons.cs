using System.Text.RegularExpressions;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Online;

// The only copy of the coupon rules: code format, validity and the discount. Callers pass the restaurant's
// local business date, read from TimeProvider, never SQL now().
public static partial class OnlineCoupons
{
    public const int MinPercent = 1;

    // Below 100, so an online bill with any dish left always stays positive and can close as PAID.
    public const int MaxPercent = 50;
    public const int MaxCoupons = 50;
    public const int MaxCodeLength = 20;

    // Customers type the code, so it is trimmed and uppercased; null when it can't be a code at all.
    public static string? Normalize(string? value)
    {
        var code = value?.Trim().ToUpperInvariant();
        return code is not null && CodePattern().IsMatch(code) ? code : null;
    }

    public static bool ValidPercent(int? percent) => percent is >= MinPercent and <= MaxPercent;

    public static bool IsValid(OnlineCoupon coupon, DateOnly businessDate) =>
        coupon.ValidUntil is not { } last || last >= businessDate;

    // Rounded down to the cent. SessionSummaries.Project repeats this in SQL with the same integer division.
    public static long DiscountCents(long itemsCents, int percentOff) =>
        itemsCents * percentOff / 100;

    // Repeated by ck_online_coupon_code.
    [GeneratedRegex("^[A-Z0-9]{3,20}$")]
    private static partial Regex CodePattern();
}
