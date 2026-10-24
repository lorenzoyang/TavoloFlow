namespace TavoloFlow.Api.Entities;

public sealed class RestaurantSubscriptionPeriod
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public DateOnly StartsOn { get; set; }
    public DateOnly EndsOn { get; set; }
    public int Years { get; set; }
    public long AmountCents { get; set; }
    public DateOnly? PaidOn { get; set; }
    public DateTime CreatedAt { get; set; }
    public Restaurant Restaurant { get; set; } = null!;
}
