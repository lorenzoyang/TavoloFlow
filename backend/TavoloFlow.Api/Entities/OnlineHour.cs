namespace TavoloFlow.Api.Entities;

// One weekly online ordering slot in the restaurant's local time; each weekday has at most two.
// ClosesMinute is the last moment to order (up to 1440, midnight), not the closing time.
public sealed class OnlineHour
{
    public Guid RestaurantId { get; set; }

    // ISO weekday: Monday is 1, Sunday is 7.
    public int Weekday { get; set; }

    // 1 or 2, numbered by opening time within the weekday.
    public int Slot { get; set; }
    public int OpensMinute { get; set; }
    public int ClosesMinute { get; set; }
    public Restaurant Restaurant { get; set; } = null!;
}
