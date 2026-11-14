namespace TavoloFlow.Api.Entities;

public enum DiningSessionStatus
{
    Active,
    Closed,
}

public enum SessionCloseReason
{
    Paid,
    Voided,

    // Dine-in only: a table opened and closed without orders.
    Empty,

    // Online only: the customer never collected or refused the delivery.
    NoShow,
}

// A session is a dine-in visit at a table, or an accepted online order for pickup or delivery.
// The channel is fixed when the session is created.
public enum SessionChannel
{
    DineIn,
    Pickup,
    Delivery,
}

public sealed class DiningSession
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public SessionChannel Channel { get; set; } = SessionChannel.DineIn;
    public Guid? TableId { get; set; }
    public DiningSessionStatus Status { get; set; } = DiningSessionStatus.Active;
    public string? JoinCodeCiphertext { get; set; }
    public int BillVersion { get; set; } = 1;

    // Dine-in only; online sessions have no table, label or join code.
    public string? TableLabelSnapshot { get; set; }

    // Delivery only, and then required: entered by whoever accepts the order.
    public long? DeliveryFeeCents { get; set; }
    public DateTime OpenedAt { get; set; }
    public DateTime? ClosedAt { get; set; }
    public SessionCloseReason? CloseReason { get; set; }
    public long? ClosedTotalCents { get; set; }

    public Restaurant Restaurant { get; set; } = null!;
    public RestaurantTable? Table { get; set; }
    public ICollection<Order> Orders { get; } = new List<Order>();
}
