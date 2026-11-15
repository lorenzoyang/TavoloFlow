namespace TavoloFlow.Api.Entities;

// One ordered line exactly as the customer confirmed it: the dish's snapshot fields of OrderItem.
// QR orders turn it into an order item at once; an online request keeps it as JSON until it is accepted.
// ToOrderItem is the only conversion, and a test keeps it covering every snapshot field of OrderItem.
public sealed class OrderLineSnapshot
{
    // Not a foreign key: the dish may be deleted while an online request waits.
    public Guid MenuItemId { get; set; }
    public string? ItemCode { get; set; }
    public string? NameZh { get; set; }
    public string? NameIt { get; set; }
    public string? NameEn { get; set; }
    public string[] AllergenCodes { get; set; } = [];

    // The dish price plus the chosen options' deltas.
    public long UnitPriceCents { get; set; }
    public int Quantity { get; set; }
    public string? Remark { get; set; }
    public List<OrderItemOption> Options { get; set; } = [];

    // menuItemExists is false when the dish was deleted in the meantime: the line keeps its snapshot
    // names without a menu link.
    public OrderItem ToOrderItem(Guid restaurantId, bool menuItemExists) =>
        new()
        {
            Id = Guid.CreateVersion7(),
            RestaurantId = restaurantId,
            MenuItemId = menuItemExists ? MenuItemId : null,
            ItemCodeSnapshot = ItemCode,
            NameZhSnapshot = NameZh,
            NameItSnapshot = NameIt,
            NameEnSnapshot = NameEn,
            AllergenCodesSnapshot = [.. AllergenCodes],
            UnitPriceCents = UnitPriceCents,
            Quantity = Quantity,
            Remark = Remark,
            OptionsSnapshot = Options
                .Select(option => new OrderItemOption
                {
                    GroupNameZh = option.GroupNameZh,
                    GroupNameIt = option.GroupNameIt,
                    GroupNameEn = option.GroupNameEn,
                    NameZh = option.NameZh,
                    NameIt = option.NameIt,
                    NameEn = option.NameEn,
                    PriceDeltaCents = option.PriceDeltaCents,
                })
                .ToList(),
        };
}
