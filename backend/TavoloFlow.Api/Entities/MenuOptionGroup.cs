namespace TavoloFlow.Api.Entities;

// A restaurant-wide choice that dishes reuse, such as size, sweetness or toppings. MinSelect/MaxSelect are its
// whole rule: 1/1 is a required single choice, 0/3 up to three optional extras.
public sealed class MenuOptionGroup
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public string? NameZh { get; set; }
    public string? NameIt { get; set; }
    public string? NameEn { get; set; }
    public int MinSelect { get; set; }
    public int MaxSelect { get; set; }

    // One restaurant-wide display order; each dish shows its own groups in this relative order.
    public int Position { get; set; }

    public Restaurant Restaurant { get; set; } = null!;
    public ICollection<MenuOption> Options { get; } = new List<MenuOption>();
}
