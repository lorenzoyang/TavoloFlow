using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Menus;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CategoryInput(string? NameZh, string? NameIt, string? NameEn);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record MenuItemInput(
    Guid CategoryId,
    string? ItemCode,
    string? NameZh,
    string? NameIt,
    string? NameEn,
    string? DescriptionZh,
    string? DescriptionIt,
    string? DescriptionEn,
    long PriceCents,
    string[]? AllergenCodes,
    bool AllergenReviewed
);

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
    Guid Id,
    Guid CategoryId,
    string? ItemCode,
    string? NameZh,
    string? NameIt,
    string? NameEn,
    string? DescriptionZh,
    string? DescriptionIt,
    string? DescriptionEn,
    long PriceCents,
    string[] AllergenCodes,
    bool AllergenReviewed,
    bool IsAvailable,
    Guid? ImageId
)
{
    public static MenuItemResponse From(MenuItem item) =>
        new(
            item.Id,
            item.CategoryId,
            item.ItemCode,
            item.NameZh,
            item.NameIt,
            item.NameEn,
            item.DescriptionZh,
            item.DescriptionIt,
            item.DescriptionEn,
            item.PriceCents,
            item.AllergenCodes,
            item.AllergenReviewed,
            item.IsAvailable,
            item.ImageId
        );
}

public sealed record DefaultLanguageResponse(string DefaultLanguage);

public sealed record AllergenOption(string Code, string Label, string Description);

public sealed record MenuResponse(
    Guid RestaurantId,
    string DefaultLanguage,
    string[] AvailableLanguages,
    CategoryResponse[] Categories,
    MenuItemResponse[] Items,
    IReadOnlyList<AllergenOption> Allergens
);

// Anonymous QR bootstrap: entrance state plus the menu, never join codes, orders or accounts.
public sealed record PublicRestaurantResponse(
    Guid Id,
    string Name,
    string CurrencyCode,
    string DefaultLanguage,
    string ServiceStatus,
    bool OrderingEnabled,
    bool JoinCodeRequired,
    string Theme
);

public sealed record PublicTableResponse(Guid Id, string TableLabel, bool IsEnabled);

public sealed record PublicMenuContent(
    string[] AvailableLanguages,
    CategoryResponse[] Categories,
    MenuItemResponse[] Items
);

public sealed record PublicMenuResponse(
    PublicRestaurantResponse Restaurant,
    PublicTableResponse Table,
    Guid? ActiveSessionId,
    PublicMenuContent Menu
);

public static class MenuErrors
{
    public static ApiException NotFound() =>
        new(404, "MENU_RESOURCE_NOT_FOUND", "Category or dish not found. Refresh the menu.");

    public static ApiException ImageInvalid() =>
        new(400, "IMAGE_INVALID", "Can't read the image. Upload a JPG, PNG or WebP photo.");

    public static ApiException ImageTooLarge() =>
        new(
            413,
            "IMAGE_TOO_LARGE",
            "Image too large: upload a photo up to 15 MB (about 50 megapixels)."
        );

    public static ApiException ImageNotFound() =>
        new(404, "MENU_IMAGE_NOT_FOUND", "The image doesn't exist.");
}

public static class MenuAllergens
{
    // Application codes, based on the EU 14 categories; these are not a legal certification.
    public static readonly IReadOnlyList<AllergenOption> Options =
        Array.AsReadOnly<AllergenOption>([
            new(
                "GLUTEN",
                "Cereals containing gluten",
                "For example wheat, rye, barley, oats and products thereof"
            ),
            new(
                "CRUSTACEANS",
                "Crustaceans",
                "For example prawns, crabs, lobsters and products thereof"
            ),
            new("EGGS", "Eggs", "Eggs and products thereof"),
            new("FISH", "Fish", "Fish and products thereof"),
            new("PEANUTS", "Peanuts", "Peanuts and products thereof"),
            new("SOY", "Soy", "Soybeans and products thereof"),
            new("MILK", "Milk", "Milk and products thereof, including lactose"),
            new(
                "NUTS",
                "Tree nuts",
                "For example almonds, hazelnuts, walnuts, cashews and products thereof"
            ),
            new("CELERY", "Celery", "Celery and products thereof"),
            new("MUSTARD", "Mustard", "Mustard and products thereof"),
            new("SESAME", "Sesame", "Sesame seeds and products thereof"),
            new(
                "SULPHITES",
                "Sulphur dioxide and sulphites",
                "Above 10 mg/kg or 10 mg/L, expressed as total sulphur dioxide"
            ),
            new("LUPIN", "Lupin", "Lupin and products thereof"),
            new(
                "MOLLUSCS",
                "Molluscs",
                "For example mussels, oysters, squid, snails and products thereof"
            ),
        ]);
}
