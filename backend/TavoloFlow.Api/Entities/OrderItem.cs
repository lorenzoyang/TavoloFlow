namespace TavoloFlow.Api.Entities;

public enum OrderItemStatus
{
    New,
    Ready,
    Cancelled,
}

public sealed class OrderItem
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public Guid OrderId { get; set; }
    public Guid? MenuItemId { get; set; }
    public string? ItemCodeSnapshot { get; set; }
    public string? NameZhSnapshot { get; set; }
    public string? NameItSnapshot { get; set; }
    public string? NameEnSnapshot { get; set; }
    public string[] AllergenCodesSnapshot { get; set; } = [];

    // The dish price plus the chosen options' deltas, so every bill sum stays UnitPriceCents * Quantity.
    public long UnitPriceCents { get; set; }
    public int Quantity { get; set; }
    public string? Remark { get; set; }

    // The chosen options as the guest saw them, in display order; later menu edits never change it.
    public List<OrderItemOption> OptionsSnapshot { get; set; } = [];
    public OrderItemStatus Status { get; set; } = OrderItemStatus.New;
    public DateTime? ReadyAt { get; set; }
    public DateTime? CancelledAt { get; set; }

    // Set when a waiter takes a READY item from the pass; never affects the bill.
    public DateTime? ServedAt { get; set; }

    public Restaurant Restaurant { get; set; } = null!;
    public Order Order { get; set; } = null!;
    public MenuItem? MenuItem { get; set; }
}

// One chosen option inside an order line's JSON snapshot.
public sealed class OrderItemOption
{
    public string? GroupNameZh { get; set; }
    public string? GroupNameIt { get; set; }
    public string? GroupNameEn { get; set; }
    public string? NameZh { get; set; }
    public string? NameIt { get; set; }
    public string? NameEn { get; set; }
    public long PriceDeltaCents { get; set; }
}
