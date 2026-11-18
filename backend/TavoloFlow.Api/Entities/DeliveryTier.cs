namespace TavoloFlow.Api.Entities;

// One delivery fee band: up to MaxMeters of road distance from the restaurant, FeeCents (0 for free).
// A restaurant has at most five, saved together; the farthest one is the delivery limit.
public sealed class DeliveryTier
{
    public Guid RestaurantId { get; set; }
    public int MaxMeters { get; set; }
    public long FeeCents { get; set; }
    public Restaurant Restaurant { get; set; } = null!;
}
