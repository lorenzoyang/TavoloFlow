using TavoloFlow.Api.Common;
using static TavoloFlow.Api.Common.InputRules;

namespace TavoloFlow.Api.Menus;

public static class MenuValidation
{
    public const int MaxCategoryNameLength = 100;

    // Order items copy the dish name and code, so their snapshot columns share these limits.
    public const int MaxItemNameLength = 150;
    public const int MaxItemCodeLength = 40;

    public static CategoryInput Normalize(CategoryInput input)
    {
        var value = input with
        {
            NameZh = TrimToNull(input.NameZh),
            NameIt = TrimToNull(input.NameIt),
            NameEn = TrimToNull(input.NameEn),
        };
        var errors = new Dictionary<string, string[]>();
        Names(value.NameZh, value.NameIt, value.NameEn, MaxCategoryNameLength, errors);
        Reject(errors);
        return value;
    }

    public static MenuItemInput Normalize(MenuItemInput input)
    {
        var value = input with
        {
            ItemCode = TrimToNull(input.ItemCode),
            NameZh = TrimToNull(input.NameZh),
            NameIt = TrimToNull(input.NameIt),
            NameEn = TrimToNull(input.NameEn),
            DescriptionZh = TrimToNull(input.DescriptionZh),
            DescriptionIt = TrimToNull(input.DescriptionIt),
            DescriptionEn = TrimToNull(input.DescriptionEn),
        };
        var errors = new Dictionary<string, string[]>();
        Names(value.NameZh, value.NameIt, value.NameEn, MaxItemNameLength, errors);
        if (value.ItemCode?.Length > MaxItemCodeLength)
            errors["itemCode"] = [$"The item code can be at most {MaxItemCodeLength} characters."];
        if (value.PriceCents < 1 || value.PriceCents > MaxSafeCents)
            errors["priceCents"] =
            [
                "The price must be positive whole euro cents within the safe integer range.",
            ];
        foreach (
            var (name, description, field) in new[]
            {
                (value.NameZh, value.DescriptionZh, "descriptionZh"),
                (value.NameIt, value.DescriptionIt, "descriptionIt"),
                (value.NameEn, value.DescriptionEn, "descriptionEn"),
            }
        )
            if (description is not null && name is null)
                errors[field] = ["Enter the name in this language first."];
        if (!value.AllergenReviewed)
            errors["allergenReviewed"] = ["Confirm the allergen review before saving."];
        if (
            value.AllergenCodes is null
            || value.AllergenCodes.Any(code =>
                !MenuAllergens.Options.Any(option => option.Code == code)
            )
        )
            errors["allergenCodes"] =
            [
                "Choose valid allergen options; send an empty array when the review found no allergens.",
            ];
        Reject(errors);
        // Canonical order and no duplicates, independent of checkbox selection order.
        return value with
        {
            AllergenCodes = MenuAllergens
                .Options.Where(option => value.AllergenCodes!.Contains(option.Code))
                .Select(option => option.Code)
                .ToArray(),
        };
    }

    private static void Names(
        string? zh,
        string? it,
        string? en,
        int max,
        Dictionary<string, string[]> errors
    )
    {
        if (zh is null && it is null && en is null)
            errors["names"] = ["Enter a name in at least one language."];
        foreach (var (name, field) in new[] { (zh, "nameZh"), (it, "nameIt"), (en, "nameEn") })
            if (name?.Length > max)
                errors[field] = [$"The name can be at most {max} characters."];
    }

    private static void Reject(Dictionary<string, string[]> errors)
    {
        if (errors.Count > 0)
            throw ApiException.Validation("Check the menu content.", errors);
    }
}
