namespace TavoloFlow.Api.Entities;

public enum SubscriptionNoticeKind
{
    Registered,
    Changed,
    Paid,
    DueSoon,
    Expired,
}

public sealed class SubscriptionNotice
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public Guid PeriodId { get; set; }
    public SubscriptionNoticeKind Kind { get; set; }
    public DateTime CreatedAt { get; set; }
    public string? Reason { get; set; }
    public string? Change { get; set; }
    public DateOnly? Deadline { get; set; }
    public DateTime? OwnerAcknowledgedAt { get; set; }
    public Restaurant Restaurant { get; set; } = null!;
    public ICollection<PlatformSubscriptionReceipt> PlatformReceipts { get; } = [];
}

public sealed class PlatformSubscriptionReceipt
{
    public Guid NoticeId { get; set; }
    public Guid PlatformUserId { get; set; }
}
