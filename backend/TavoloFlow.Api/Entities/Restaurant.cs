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

    // The platform turns each service on per restaurant; at least one stays on.
    public bool DineInEnabled { get; set; } = true;
    public bool OnlineEnabled { get; set; }
    public int? PickupMinNoticeMinutes { get; set; }
    public int PickupMaxDaysAhead { get; set; } = 1;

    // The readable online ordering link /r/{slug}; required while online ordering is on.
    public string? Slug { get; set; }

    // Online ordering settings: the public phone (OWNER) and a pause that lapses on its own (STAFF, OWNER).
    public string? PublicPhone { get; set; }
    public DateTime? OnlinePausedUntil { get; set; }

    // Restaurant-run delivery (OWNER): the switch and an optional zh/it/en note shown at checkout.
    // Fees come from the restaurant's DeliveryTiers by road distance; whoever accepts picks a tier.
    public bool DeliveryEnabled { get; set; }
    public string? DeliveryNoteZh { get; set; }
    public string? DeliveryNoteIt { get; set; }
    public string? DeliveryNoteEn { get; set; }

    // The least a delivery order's dishes may come to after its coupon; null for no minimum.
    public long? DeliveryMinOrderCents { get; set; }

    // Where deliveries start, pasted from Google Maps; both set or both null, and required while
    // delivery is on. Staff pages draw the route from here to the customer's address.
    public decimal? DeliveryOriginLat { get; set; }
    public decimal? DeliveryOriginLng { get; set; }

    public DateTime CreatedAt { get; set; }
    public string? GoogleMapsUrl { get; set; }
    public string? OwnerContact { get; set; }
    public long? DefaultMonthlyFeeCents { get; set; }
    public int SubscriptionVersion { get; set; } = 1;

    public ICollection<RestaurantUser> Users { get; } = new List<RestaurantUser>();
    public ICollection<RestaurantTable> Tables { get; } = new List<RestaurantTable>();
    public ICollection<MenuCategory> MenuCategories { get; } = new List<MenuCategory>();
    public ICollection<MenuItem> MenuItems { get; } = new List<MenuItem>();
    public ICollection<DiningSession> DiningSessions { get; } = new List<DiningSession>();
    public ICollection<Order> Orders { get; } = new List<Order>();
    public ICollection<OrderItem> OrderItems { get; } = new List<OrderItem>();
}
