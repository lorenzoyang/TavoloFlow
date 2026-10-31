namespace TavoloFlow.Api.Entities;

public enum DiningSessionStatus
{
    Active,
    Closed
}

public enum SessionCloseReason
{
    Paid,
    Voided,
    Empty
}

// How the visit reached the restaurant: a table's QR code, or an accepted online pickup request.
public enum SessionChannel
{
    DineIn,
    Pickup
}

// A visit's bill ("单据"): a dine-in table from opening to closure, or one accepted pickup order.
// The class keeps its historical name; APIs and the UI already call it a session.
public sealed class DiningSession
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public SessionChannel Channel { get; set; } = SessionChannel.DineIn;
    // Table, table label and join code belong to dine-in visits only; pickup visits leave them NULL.
    public Guid? TableId { get; set; }
    public DiningSessionStatus Status { get; set; } = DiningSessionStatus.Active;
    public string? JoinCodeCiphertext { get; set; }
    public int BillVersion { get; set; } = 1;
    public string? TableLabelSnapshot { get; set; }
    public DateTime OpenedAt { get; set; }
    public DateTime? ClosedAt { get; set; }
    public SessionCloseReason? CloseReason { get; set; }
    public long? ClosedTotalCents { get; set; }

    public Restaurant Restaurant { get; set; } = null!;
    public RestaurantTable? Table { get; set; }
    public ICollection<Order> Orders { get; } = new List<Order>();
}
