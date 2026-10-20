namespace TavoloFlow.Api.Entities;

public sealed class MenuItem
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public Guid CategoryId { get; set; }
    public string? ItemCode { get; set; }
    public string? NameZh { get; set; }
    public string? NameIt { get; set; }
    public string? NameEn { get; set; }
    public string? DescriptionZh { get; set; }
    public string? DescriptionIt { get; set; }
    public string? DescriptionEn { get; set; }
    public long PriceCents { get; set; }
    public string[] AllergenCodes { get; set; } = [];
    public bool AllergenReviewed { get; set; }
    public bool IsAvailable { get; set; } = true;

    public Restaurant Restaurant { get; set; } = null!;
    public MenuCategory Category { get; set; } = null!;
}
