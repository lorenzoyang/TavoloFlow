namespace TavoloFlow.Api.Entities;

public enum OnlineFulfillment
{
    Pickup,
    Delivery,
}

public enum OnlineRejectReason
{
    SoldOut,
    Busy,
    Closing,

    // Delivery only.
    OutOfRange,
}

// One online submission. It has no status column: accepted, rejected, waiting or expired follows from
// AcceptedAt, RejectedAt and ExpiresAt compared with the current time (Online/OnlineRequestState).
// Only acceptance creates the session, order and order items; expired and rejected requests never do.
public sealed class OnlineRequest
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public Guid ClientRequestId { get; set; }

    // A random secret: the customer's status page link /o/{token}.
    public required string StatusToken { get; set; }

    // The restaurant's local date at submission and that day's number, shared by pickup and delivery.
    public DateOnly BusinessDate { get; set; }
    public int Number { get; set; }
    public OnlineFulfillment Fulfillment { get; set; }

    // Required at submission and cleared after 30 days; the address and notes are delivery only.
    public string? CustomerName { get; set; }
    public string? CustomerPhone { get; set; }
    public string? DeliveryAddress { get; set; }
    public string? DeliveryNotes { get; set; }

    public List<OrderLineSnapshot> Lines { get; set; } = [];
    public long ItemsTotalCents { get; set; }
    public required string DefaultLanguageSnapshot { get; set; }
    public DateTime SubmittedAt { get; set; }
    public DateTime ExpiresAt { get; set; }

    // Written together on acceptance.
    public DateTime? AcceptedAt { get; set; }
    public DateTime? EstimatedAt { get; set; }
    public Guid? SessionId { get; set; }

    public DateTime? RejectedAt { get; set; }
    public OnlineRejectReason? RejectReason { get; set; }

    public Restaurant Restaurant { get; set; } = null!;
    public DiningSession? Session { get; set; }
}
