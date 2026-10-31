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

public static class PickupErrors
{
    public static ApiException NotOffered() => new(409, "PICKUP_NOT_OFFERED", "这家餐厅暂不提供线上点单。");
    public static ApiException MenuLinkNotFound() => new(404, "MENU_LINK_NOT_FOUND", "线上菜单链接无效。");
    public static ApiException NotFound() => new(404, "PICKUP_NOT_FOUND", "暂未查到这个订单。");
}
