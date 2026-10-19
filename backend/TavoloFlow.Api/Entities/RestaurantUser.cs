namespace TavoloFlow.Api.Entities;

public enum RestaurantUserRole
{
    Owner,
    Staff
}

public sealed class RestaurantUser
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public required string Username { get; set; }
    public required string PasswordHash { get; set; }
    public required RestaurantUserRole Role { get; set; }
    public bool IsActive { get; set; } = true;
    public bool MustChangePassword { get; set; } = true;
    public int CredentialVersion { get; set; } = 1;
    public DateTime CreatedAt { get; set; }

    public Restaurant Restaurant { get; set; } = null!;
}
