namespace TavoloFlow.Api.Entities;

// The last pickup/delivery number a restaurant handed out on one local business date. Submissions take
// the next number with one upsert, which also serializes a restaurant's submissions for that day.
public sealed class OnlineCounter
{
    public Guid RestaurantId { get; set; }
    public DateOnly BusinessDate { get; set; }
    public int LastNumber { get; set; }

    public Restaurant Restaurant { get; set; } = null!;
}
