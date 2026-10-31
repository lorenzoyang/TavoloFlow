namespace TavoloFlow.Api.Entities;

// Why staff declined a request. Fixed choices, so guests read them in their own language.
public enum PickupRejectReason
{
    SoldOut,
    Busy,
    Closing
}

// A guest's online pickup request ("下单请求"). It has no status column: accepted, rejected, pending until
// ExpiresAt and expired from then on, always decided by Pickup/PickupState. Only acceptance creates a
// session (channel PICKUP) and its order; requests never accepted stay outside sessions and orders.
public sealed class PickupRequest
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    // Browser-generated; one request per (restaurant, client request).
    public Guid ClientRequestId { get; set; }
    // Server-generated 32-byte Base64URL secret behind /o/{token}; reads this request only.
    public required string StatusToken { get; set; }
    // The restaurant's local day of submission and the day's pickup number, from 1.
    public DateOnly BusinessDate { get; set; }
    public int PickupNumber { get; set; }
    public required string CustomerName { get; set; }
    public required string CustomerPhone { get; set; }
    public long TotalAmountCents { get; set; }
    public required string DefaultLanguageSnapshot { get; set; }
    public DateTime SubmittedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    // Acceptance writes these three together.
    public DateTime? AcceptedAt { get; set; }
    public DateTime? EstimatedReadyAt { get; set; }
    public Guid? SessionId { get; set; }
    public DateTime? RejectedAt { get; set; }
    public PickupRejectReason? RejectReason { get; set; }

    public Restaurant Restaurant { get; set; } = null!;
    public DiningSession? Session { get; set; }
    public ICollection<PickupRequestItem> Items { get; } = new List<PickupRequestItem>();
}

// A submitted line: the same snapshot columns as order_items, written once and copied into an order item
// on acceptance (OrderLineSnapshot). Add a snapshot column to both tables and to that copy together.
public sealed class PickupRequestItem
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public Guid PickupRequestId { get; set; }
    public Guid? MenuItemId { get; set; }
    public string? ItemCodeSnapshot { get; set; }
    public string? NameZhSnapshot { get; set; }
    public string? NameItSnapshot { get; set; }
    public string? NameEnSnapshot { get; set; }
    public string[] AllergenCodesSnapshot { get; set; } = [];
    public long UnitPriceCents { get; set; }
    public int Quantity { get; set; }
    public string? Remark { get; set; }

    public PickupRequest PickupRequest { get; set; } = null!;
    public MenuItem? MenuItem { get; set; }
}

// The last pickup number handed out on a restaurant's local day. Submissions upsert it, which also lines up
// a restaurant's concurrent submissions of that day.
public sealed class PickupCounter
{
    public Guid RestaurantId { get; set; }
    public DateOnly BusinessDate { get; set; }
    public int LastNumber { get; set; }
}
