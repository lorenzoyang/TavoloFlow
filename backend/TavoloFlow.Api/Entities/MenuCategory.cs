namespace TavoloFlow.Api.Entities;

public sealed class MenuCategory
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public string? NameZh { get; set; }
    public string? NameIt { get; set; }
    public string? NameEn { get; set; }
    public DateTime? DeletedAt { get; set; }
    public DateTime CreatedAt { get; set; }

    public Restaurant Restaurant { get; set; } = null!;
    public ICollection<MenuItem> Items { get; } = new List<MenuItem>();
}
