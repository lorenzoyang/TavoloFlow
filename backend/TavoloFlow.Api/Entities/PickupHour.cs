namespace TavoloFlow.Api.Entities;

// One weekly window in which the online menu takes pickup requests, in the restaurant's local time.
// A day has at most two windows; a day without rows takes no requests.
public sealed class PickupHour
{
    public Guid RestaurantId { get; set; }
    // ISO weekday: Monday is 1, Sunday is 7.
    public int Weekday { get; set; }
    public int Slot { get; set; }
    // Minutes since local midnight. ClosesMinute is the last moment to order (exclusive), at most 24:00.
    public int OpensMinute { get; set; }
    public int ClosesMinute { get; set; }

    public Restaurant Restaurant { get; set; } = null!;
}
