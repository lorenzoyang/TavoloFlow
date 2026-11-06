namespace TavoloFlow.Api.Entities;

public enum RestaurantServiceStatus
{
    Suspended,
    Active,
}

// Colour presets for the guest and staff pages; the platform chooses one per restaurant.
public enum RestaurantTheme
{
    Terracotta,
    Lacquer,
    Indigo,
    Ink,
    Taro,
}

public sealed class Restaurant
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public required string DefaultLanguage { get; set; }
    public string TimeZone { get; set; } = "Europe/Rome";
    public string CurrencyCode { get; set; } = "EUR";
    public RestaurantServiceStatus ServiceStatus { get; set; } = RestaurantServiceStatus.Suspended;
    public bool OrderingEnabled { get; set; }
    public bool JoinCodeRequired { get; set; } = true;
    public RestaurantTheme Theme { get; set; } = RestaurantTheme.Terracotta;
    public DateTime CreatedAt { get; set; }
    public string? GoogleMapsUrl { get; set; }
    public string? OwnerContact { get; set; }
    public long? DefaultAnnualFeeCents { get; set; }
    public int SubscriptionVersion { get; set; } = 1;

    public ICollection<RestaurantUser> Users { get; } = new List<RestaurantUser>();
    public ICollection<RestaurantTable> Tables { get; } = new List<RestaurantTable>();
    public ICollection<MenuCategory> MenuCategories { get; } = new List<MenuCategory>();
    public ICollection<MenuItem> MenuItems { get; } = new List<MenuItem>();
    public ICollection<DiningSession> DiningSessions { get; } = new List<DiningSession>();
    public ICollection<Order> Orders { get; } = new List<Order>();
    public ICollection<OrderItem> OrderItems { get; } = new List<OrderItem>();
}
