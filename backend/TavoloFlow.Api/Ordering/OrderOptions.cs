using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Menus;

namespace TavoloFlow.Api.Ordering;

// Prices one order line's chosen options against the dish's current groups.
internal static class OrderOptions
{
    public sealed record Choice(
        long UnitPriceCents,
        List<OrderItemOption> Snapshot,
        string[] AllergenCodes
    );

    // Groups arrive in the restaurant-wide order with their options loaded. Returns null when the selection no
    // longer fits: an option that is gone, sold out or from a group the dish doesn't use, or a group whose
    // count is outside its minimum and maximum.
    public static Choice? Resolve(
        MenuItem item,
        IReadOnlyList<MenuOptionGroup> groups,
        IReadOnlyCollection<Guid> optionIds
    )
    {
        var chosen = optionIds.ToHashSet();
        var snapshot = new List<OrderItemOption>();
        var allergens = new List<string>(item.AllergenCodes);
        // At most 50 deltas within the safe range cannot overflow a long; the caller checks the safe range.
        var price = item.PriceCents;
        var matched = 0;
        foreach (var group in groups)
        {
            var picked = group
                .Options.Where(option => chosen.Contains(option.Id))
                .OrderBy(option => option.Position)
                .ThenBy(option => option.Id)
                .ToArray();
            if (
                picked.Length < group.MinSelect
                || picked.Length > group.MaxSelect
                || picked.Any(option => !option.IsAvailable)
            )
                return null;
            matched += picked.Length;
            foreach (var option in picked)
            {
                price += option.PriceDeltaCents;
                allergens.AddRange(option.AllergenCodes);
                snapshot.Add(
                    new OrderItemOption
                    {
                        GroupNameZh = group.NameZh,
                        GroupNameIt = group.NameIt,
                        GroupNameEn = group.NameEn,
                        NameZh = option.NameZh,
                        NameIt = option.NameIt,
                        NameEn = option.NameEn,
                        PriceDeltaCents = option.PriceDeltaCents,
                    }
                );
            }
        }
        if (matched != chosen.Count)
            return null;
        return new(price, snapshot, MenuValidation.CanonicalAllergens(allergens));
    }
}
