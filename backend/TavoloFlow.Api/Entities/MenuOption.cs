namespace TavoloFlow.Api.Entities;

public sealed class MenuOption
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public Guid GroupId { get; set; }
    public string? NameZh { get; set; }
    public string? NameIt { get; set; }
    public string? NameEn { get; set; }

    // Added to the dish price for each portion; never negative.
    public long PriceDeltaCents { get; set; }

    // An extra such as cheese foam brings its own allergens; orders add them to the dish's.
    public string[] AllergenCodes { get; set; } = [];
    public bool IsAvailable { get; set; } = true;

    // Order within the group.
    public int Position { get; set; }

    public MenuOptionGroup Group { get; set; } = null!;
}
