using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Menus;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CategoryInput(string? NameZh, string? NameIt, string? NameEn);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record MenuItemInput(
    Guid CategoryId, string? ItemCode, string? NameZh, string? NameIt, string? NameEn,
    string? DescriptionZh, string? DescriptionIt, string? DescriptionEn,
    long PriceCents, string[]? AllergenCodes, bool AllergenReviewed);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record AvailabilityInput([Required] bool? IsAvailable);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record DefaultLanguageInput(string? DefaultLanguage);

public sealed record CategoryResponse(Guid Id, string? NameZh, string? NameIt, string? NameEn)
{
    public static CategoryResponse From(MenuCategory category) =>
        new(category.Id, category.NameZh, category.NameIt, category.NameEn);
}

public sealed record MenuItemResponse(
    Guid Id, Guid CategoryId, string? ItemCode, string? NameZh, string? NameIt, string? NameEn,
    string? DescriptionZh, string? DescriptionIt, string? DescriptionEn,
    long PriceCents, string[] AllergenCodes, bool AllergenReviewed, bool IsAvailable)
{
    public static MenuItemResponse From(MenuItem item) => new(item.Id, item.CategoryId, item.ItemCode,
        item.NameZh, item.NameIt, item.NameEn, item.DescriptionZh, item.DescriptionIt, item.DescriptionEn,
        item.PriceCents, item.AllergenCodes, item.AllergenReviewed, item.IsAvailable);
}

public sealed record DefaultLanguageResponse(string DefaultLanguage);
public sealed record AllergenOption(string Code, string Label, string Description);
public sealed record MenuResponse(
    Guid RestaurantId, string DefaultLanguage, string[] AvailableLanguages,
    CategoryResponse[] Categories, MenuItemResponse[] Items, IReadOnlyList<AllergenOption> Allergens);

public static class MenuErrors
{
    public static ApiException NotFound() => new(404, "MENU_RESOURCE_NOT_FOUND", "分类或菜品不存在，请刷新菜单。");
}

public static class MenuAllergens
{
    // Application codes, based on the EU 14 categories; these are not a legal certification.
    public static readonly IReadOnlyList<AllergenOption> Options = Array.AsReadOnly<AllergenOption>([
        new("GLUTEN", "含麸质谷物", "例如小麦、黑麦、大麦、燕麦及其制品"),
        new("CRUSTACEANS", "甲壳类", "例如虾、蟹、龙虾及其制品"),
        new("EGGS", "蛋", "蛋及其制品"),
        new("FISH", "鱼", "鱼及其制品"),
        new("PEANUTS", "花生", "花生及其制品"),
        new("SOY", "大豆", "大豆及其制品"),
        new("MILK", "奶", "奶及其制品，包括乳糖"),
        new("NUTS", "坚果", "例如杏仁、榛子、核桃、腰果及其制品"),
        new("CELERY", "芹菜", "芹菜及其制品"),
        new("MUSTARD", "芥末", "芥末及其制品"),
        new("SESAME", "芝麻", "芝麻及其制品"),
        new("SULPHITES", "二氧化硫及亚硫酸盐", "以总二氧化硫计，浓度超过 10 mg/kg 或 10 mg/L"),
        new("LUPIN", "羽扇豆", "羽扇豆及其制品"),
        new("MOLLUSCS", "软体动物", "例如贻贝、牡蛎、鱿鱼、蜗牛及其制品")
    ]);
}
