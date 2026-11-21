namespace TavoloFlow.Api.Entities;

public sealed class PlatformPushSubscription
{
    public Guid Id { get; set; }
    public Guid PlatformUserId { get; set; }
    public required string Endpoint { get; set; }
    public required string P256dh { get; set; }
    public required string Auth { get; set; }
    public required string Language { get; set; }
    public int CredentialVersion { get; set; }
    public DateTime ExpiresAt { get; set; }
    public PlatformUser User { get; set; } = null!;
}
