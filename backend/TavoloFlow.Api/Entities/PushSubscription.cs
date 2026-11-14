namespace TavoloFlow.Api.Entities;

// One staff device that receives lock-screen notifications of new online orders. The endpoint is
// the browser's push service URL and identifies the device; signing in on the device again moves
// the row to that account. CredentialVersion and ExpiresAt record the sign-in that registered it:
// once the account's credentials change or that sign-in expires, the device no longer receives
// anything (PushTargets).
public sealed class PushSubscription
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public Guid UserId { get; set; }
    public required string Endpoint { get; set; }
    public required string P256dh { get; set; }
    public required string Auth { get; set; }
    public int CredentialVersion { get; set; }
    public required string Language { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Restaurant Restaurant { get; set; } = null!;
    public RestaurantUser User { get; set; } = null!;
}
