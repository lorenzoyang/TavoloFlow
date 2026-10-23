using TavoloFlow.Api.Common;
using static TavoloFlow.Api.Common.InputRules;

namespace TavoloFlow.Api.Menus;

public static class MenuValidation
{
    public static CategoryInput Normalize(CategoryInput input)
    {
        var value = input with { NameZh = TrimToNull(input.NameZh), NameIt = TrimToNull(input.NameIt), NameEn = TrimToNull(input.NameEn) };
        var errors = new Dictionary<string, string[]>();
        Names(value.NameZh, value.NameIt, value.NameEn, 100, errors);
        Reject(errors);
        return value;
    }

    public static MenuItemInput Normalize(MenuItemInput input)
    {
        var value = input with
        {
            ItemCode = TrimToNull(input.ItemCode), NameZh = TrimToNull(input.NameZh), NameIt = TrimToNull(input.NameIt),
            NameEn = TrimToNull(input.NameEn), DescriptionZh = TrimToNull(input.DescriptionZh),
            DescriptionIt = TrimToNull(input.DescriptionIt), DescriptionEn = TrimToNull(input.DescriptionEn)
        };
        var errors = new Dictionary<string, string[]>();
        Names(value.NameZh, value.NameIt, value.NameEn, 150, errors);
        if (value.ItemCode?.Length > 40) errors["itemCode"] = ["编号最多 40 个字符。"];
        if (value.PriceCents < 1 || value.PriceCents > MaxSafeCents)
            errors["priceCents"] = ["价格必须为正整数欧分，且不能超过安全整数范围。"];
        foreach (var (name, description, field) in new[]
        {
            (value.NameZh, value.DescriptionZh, "descriptionZh"),
            (value.NameIt, value.DescriptionIt, "descriptionIt"),
            (value.NameEn, value.DescriptionEn, "descriptionEn")
        })
            if (description is not null && name is null) errors[field] = ["请先填写对应语言的名称。"];
        if (!value.AllergenReviewed) errors["allergenReviewed"] = ["保存前必须确认已完成过敏原审核。"];
        if (value.AllergenCodes is null || value.AllergenCodes.Any(code => !MenuAllergens.Options.Any(option => option.Code == code)))
            errors["allergenCodes"] = ["请选择有效的过敏原选项；已审核未识别出过敏原时请提交空数组。"];
        Reject(errors);
        // Canonical order and no duplicates, independent of checkbox selection order.
        return value with { AllergenCodes = MenuAllergens.Options.Where(option => value.AllergenCodes!.Contains(option.Code))
            .Select(option => option.Code).ToArray() };
    }

    private static void Names(string? zh, string? it, string? en, int max, Dictionary<string, string[]> errors)
    {
        if (zh is null && it is null && en is null) errors["names"] = ["至少填写一种语言的名称。"];
        foreach (var (name, field) in new[] { (zh, "nameZh"), (it, "nameIt"), (en, "nameEn") })
            if (name?.Length > max) errors[field] = [$"名称最多 {max} 个字符。"];
    }

    private static void Reject(Dictionary<string, string[]> errors)
    {
        if (errors.Count > 0) throw ApiException.Validation("请检查菜单内容。", errors);
    }
}
