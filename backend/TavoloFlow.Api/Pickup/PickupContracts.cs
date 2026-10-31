using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Menus;
using TavoloFlow.Api.Ordering;

namespace TavoloFlow.Api.Pickup;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record PickupHourInput(int Weekday, int Slot, int OpensMinute, int ClosesMinute);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record PickupHoursInput([Required] PickupHourInput?[]? Hours);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record PickupPausedInput([Required] bool? Paused);

public sealed record PickupHourResponse(int Weekday, int Slot, int OpensMinute, int ClosesMinute)
{
    public static PickupHourResponse From(PickupHour hour) => new(hour.Weekday, hour.Slot, hour.OpensMinute, hour.ClosesMinute);
}

// Status is the current availability; NextOpensAt is set while it is CLOSED_HOURS and an opening falls within seven days.
public sealed record PickupSettingsResponse(bool PickupEnabled, string? Slug, string? Phone, bool Paused,
    PickupHourResponse[] Hours, string Status, DateTime? NextOpensAt, string TimeZone);

// Only the envelope and contact are validated before the duplicate lookup; a stored request wins over resent contents.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record PickupRequestInput([Required] Guid? ClientRequestId, string? CustomerName, string? CustomerPhone,
    OrderLineInput?[]? Items);

// The anonymous online menu: what the restaurant offers and whether it takes requests now.
public sealed record OnlineRestaurantResponse(Guid Id, string Name, string CurrencyCode, string DefaultLanguage,
    string Theme, string? Phone);
public sealed record PickupAvailabilityResponse(string Status, DateTime? NextOpensAt);
public sealed record OnlineMenuResponse(OnlineRestaurantResponse Restaurant, PickupAvailabilityResponse Pickup,
    PublicMenuContent Menu);

// The same body for a first submission (201), a repeat (200) and recovery by client request id.
public sealed record PickupSubmissionResponse(string StatusToken, int PickupNumber, DateTime ExpiresAt)
{
    public static PickupSubmissionResponse From(PickupRequest request) =>
        new(request.StatusToken, request.PickupNumber, request.ExpiresAt);
}
public sealed record PickupSubmission(PickupSubmissionResponse Response, bool Created);

// The guest's status page. It never carries the guest's phone or any request id.
public sealed record PickupStatusRestaurant(Guid Id, string Name, string DefaultLanguage, string Theme, string? Phone, string? Slug);
public sealed record PickupStatusLine(string? ItemCode, string? NameZh, string? NameIt, string? NameEn,
    long UnitPriceCents, int Quantity, string? Remark, bool Cancelled);
public sealed record PickupStatusResponse(PickupStatusRestaurant Restaurant, int PickupNumber, string CustomerName,
    DateTime SubmittedAt, DateTime ExpiresAt, DateTime? EstimatedReadyAt, string Status, string? RejectReason,
    PickupStatusLine[] Items, long PayableAmountCents);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record AcceptPickupInput([Required] int? EstimatedMinutes);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record RejectPickupInput(string? Reason);

public sealed record PickupLineResponse(string? ItemCode, string? NameZh, string? NameIt, string? NameEn,
    int Quantity, string? Remark, long UnitPriceCents)
{
    public static PickupLineResponse From(PickupRequestItem item) => new(item.ItemCodeSnapshot, item.NameZhSnapshot,
        item.NameItSnapshot, item.NameEnSnapshot, item.Quantity, item.Remark, item.UnitPriceCents);
}
// What staff need to decide: who, how to reach them, what and how long it has waited.
public sealed record PendingPickupResponse(Guid Id, int PickupNumber, string CustomerName, string CustomerPhone,
    DateTime SubmittedAt, DateTime ExpiresAt, string DefaultLanguage, long TotalAmountCents, PickupLineResponse[] Items)
{
    public static PendingPickupResponse From(PickupRequest r) => new(r.Id, r.PickupNumber, r.CustomerName, r.CustomerPhone,
        r.SubmittedAt, r.ExpiresAt, r.DefaultLanguageSnapshot, r.TotalAmountCents,
        r.Items.OrderBy(i => i.Id).Select(PickupLineResponse.From).ToArray());
}
// Every waiting request, oldest first; at most Limit can wait, so the list is never paged.
public sealed record PendingPickupsResponse(PendingPickupResponse[] Items, int Limit);
public sealed record AcceptedPickupResponse(Guid SessionId, int PickupNumber, DateTime EstimatedReadyAt);
// Outcome is EXPIRED or REJECTED.
public sealed record UnacceptedPickupResponse(int PickupNumber, string CustomerName, string CustomerPhone,
    DateTime SubmittedAt, long TotalAmountCents, string Outcome, string? RejectReason);
public sealed record UnacceptedPickupsResponse(UnacceptedPickupResponse[] Items, DateOnly BusinessDate);

public static class PickupErrors
{
    public static ApiException NotOffered() => new(409, "PICKUP_NOT_OFFERED", "这家餐厅暂不提供线上点单。");
    public static ApiException MenuLinkNotFound() => new(404, "MENU_LINK_NOT_FOUND", "线上菜单链接无效。");
    public static ApiException NotFound() => new(404, "PICKUP_NOT_FOUND", "暂未查到这个订单。");
    public static ApiException Changed() => new(409, "PICKUP_CHANGED", "这个线上订单已被处理或已超时，请刷新列表。");
}
