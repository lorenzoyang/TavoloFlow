namespace TavoloFlow.Api.Entities;

public enum OrderItemStatus
{
    New,
    Ready,
    Cancelled
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
    public long UnitPriceCents { get; set; }
    public int Quantity { get; set; }
    public string? Remark { get; set; }
    public OrderItemStatus Status { get; set; } = OrderItemStatus.New;
    public DateTime? ReadyAt { get; set; }
    public DateTime? CancelledAt { get; set; }

    public Restaurant Restaurant { get; set; } = null!;
    public Order Order { get; set; } = null!;
    public MenuItem? MenuItem { get; set; }
}
