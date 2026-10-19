namespace TavoloFlow.Api.Entities;

public sealed class RestaurantTable
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public required string TableLabel { get; set; }
    public required string QrToken { get; set; }
    public bool IsEnabled { get; set; } = true;
    public DateTime? DeletedAt { get; set; }
    public DateTime CreatedAt { get; set; }

    public Restaurant Restaurant { get; set; } = null!;
    public ICollection<DiningSession> DiningSessions { get; } = new List<DiningSession>();
}
