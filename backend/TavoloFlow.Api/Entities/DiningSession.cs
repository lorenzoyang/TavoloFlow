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

public sealed class DiningSession
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public Guid TableId { get; set; }
    public DiningSessionStatus Status { get; set; } = DiningSessionStatus.Active;
    public string? JoinCodeCiphertext { get; set; }
    public int BillVersion { get; set; } = 1;
    public required string TableLabelSnapshot { get; set; }
    public Guid OpenedByUserId { get; set; }
    public DateTime OpenedAt { get; set; }
    public DateTime? ClosedAt { get; set; }
    public Guid? ClosedByUserId { get; set; }
    public SessionCloseReason? CloseReason { get; set; }
    public long? ClosedTotalCents { get; set; }

    public Restaurant Restaurant { get; set; } = null!;
    public RestaurantTable Table { get; set; } = null!;
    public RestaurantUser OpenedByUser { get; set; } = null!;
    public RestaurantUser? ClosedByUser { get; set; }
    public ICollection<Order> Orders { get; } = new List<Order>();
}
