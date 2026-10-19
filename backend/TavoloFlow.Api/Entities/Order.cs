namespace TavoloFlow.Api.Entities;

public enum OrderStatus
{
    New,
    Ready,
    Cancelled
}

public sealed class Order
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public Guid DiningSessionId { get; set; }
    public Guid ClientRequestId { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.New;
    public long TotalAmountCents { get; set; }
    public string? OrderNote { get; set; }
    public required string DefaultLanguageSnapshot { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ReadyAt { get; set; }
    public DateTime? CancelledAt { get; set; }
    public Guid? CancelledByUserId { get; set; }
    public string? CancelReason { get; set; }

    public Restaurant Restaurant { get; set; } = null!;
    public DiningSession DiningSession { get; set; } = null!;
    public RestaurantUser? CancelledByUser { get; set; }
    public ICollection<OrderItem> Items { get; } = new List<OrderItem>();
}
