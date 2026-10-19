namespace TavoloFlow.Api.Entities;

public sealed class PlatformUser
{
    public Guid Id { get; set; }
    public required string Username { get; set; }
    public required string PasswordHash { get; set; }
    public bool IsActive { get; set; } = true;
    public int CredentialVersion { get; set; } = 1;
    public DateTime CreatedAt { get; set; }
}
