using TavoloFlow.Api.Common;
using static TavoloFlow.Api.Common.InputRules;

namespace TavoloFlow.Api.Menus;

public static class MenuValidation
{
    public const int MaxCategoryNameLength = 100;

    // Order items copy the dish name and code, so their snapshot columns share these limits.
    public const int MaxItemNameLength = 150;
    public const int MaxItemCodeLength = 40;

    // Option groups and options share one name limit; order lines copy both names into their snapshot.
    public const int MaxOptionNameLength = 100;
    public const int MaxOptionsPerGroup = 30;
    public const int MaxOptionGroups = 50;
    public const int MaxGroupsPerItem = 10;

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
        if (!ValidAllergens(value.AllergenCodes))
            errors["allergenCodes"] =
            [
                "Choose valid allergen options; send an empty array when the review found no allergens.",
            ];
        if (
            value.OptionGroupIds is null
            || value.OptionGroupIds.Length > MaxGroupsPerItem
            || value.OptionGroupIds.Contains(Guid.Empty)
        )
            errors["optionGroupIds"] =
            [
                $"List at most {MaxGroupsPerItem} valid option groups; send an empty array for none.",
            ];
        Reject(errors);
        return value with
        {
            AllergenCodes = CanonicalAllergens(value.AllergenCodes!),
            OptionGroupIds = value.OptionGroupIds!.Distinct().ToArray(),
        };
    }

    public static OptionGroupInput Normalize(OptionGroupInput input)
    {
        var options = input.Options ?? [];
        var value = input with
        {
            NameZh = TrimToNull(input.NameZh),
            NameIt = TrimToNull(input.NameIt),
            NameEn = TrimToNull(input.NameEn),
            Options = options
                .Select(option =>
                    option is null
                        ? null
                        : option with
                        {
                            NameZh = TrimToNull(option.NameZh),
                            NameIt = TrimToNull(option.NameIt),
                            NameEn = TrimToNull(option.NameEn),
                        }
                )
                .ToArray(),
        };
        var errors = new Dictionary<string, string[]>();
        Names(value.NameZh, value.NameIt, value.NameEn, MaxOptionNameLength, errors);
        if (options.Length is < 1 or > MaxOptionsPerGroup || options.Any(x => x is null))
            errors["options"] = [$"A group needs 1–{MaxOptionsPerGroup} options."];
        else
        {
            foreach (var (option, index) in value.Options!.Select((x, i) => (x!, i)))
            {
                var field = $"options[{index}]";
                var names = new Dictionary<string, string[]>();
                Names(option.NameZh, option.NameIt, option.NameEn, MaxOptionNameLength, names);
                foreach (var (key, messages) in names)
                    errors[key == "names" ? $"{field}.names" : $"{field}.{key}"] = messages;
                if (option.Id == Guid.Empty)
                    errors[$"{field}.id"] = ["Leave the id out for a new option."];
                if (option.PriceDeltaCents < 0 || option.PriceDeltaCents > MaxSafeCents)
                    errors[$"{field}.priceDeltaCents"] =
                    [
                        "The extra price must be zero or positive whole euro cents within the safe integer range.",
                    ];
                if (!ValidAllergens(option.AllergenCodes))
                    errors[$"{field}.allergenCodes"] =
                    [
                        "Choose valid allergen options; send an empty array when the review found no allergens.",
                    ];
            }
            var ids = value.Options!.Select(x => x!.Id).OfType<Guid>().ToArray();
            if (ids.Length != ids.Distinct().Count())
                errors["options"] = ["Each option can appear only once."];
        }
        if (value.MaxSelect < 1 || value.MaxSelect > Math.Max(options.Length, 1))
            errors["maxSelect"] = ["Allow between one choice and the number of options."];
        if (value.MinSelect < 0 || value.MinSelect > value.MaxSelect)
            errors["minSelect"] = ["The minimum must be between zero and the maximum."];
        if (value.MenuItemIds is null || value.MenuItemIds.Contains(Guid.Empty))
            errors["menuItemIds"] =
            [
                "List the dishes that use the group; send an empty array for none.",
            ];
        if (!value.AllergenReviewed)
            errors["allergenReviewed"] = ["Confirm the allergen review before saving."];
        Reject(errors);
        return value with
        {
            Options = value
                .Options!.Select(x =>
                    x! with
                    {
                        AllergenCodes = CanonicalAllergens(x.AllergenCodes!),
                    }
                )
                .ToArray(),
            MenuItemIds = value.MenuItemIds!.Distinct().ToArray(),
        };
    }

    private static bool ValidAllergens(string[]? codes) =>
        codes is not null
        && codes.All(code => MenuAllergens.Options.Any(option => option.Code == code));

    // Canonical order and no duplicates, independent of checkbox selection order.
    public static string[] CanonicalAllergens(IEnumerable<string> codes)
    {
        var set = codes.ToHashSet();
        return MenuAllergens
            .Options.Where(option => set.Contains(option.Code))
            .Select(option => option.Code)
            .ToArray();
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
