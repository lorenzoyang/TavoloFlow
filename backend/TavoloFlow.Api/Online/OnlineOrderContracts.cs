using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Menus;
using TavoloFlow.Api.Ordering;

namespace TavoloFlow.Api.Online;

// The anonymous online menu at /r/{slug}. PublicPhone is shown whenever it is set; Status comes from
// OnlineAvailability and NextOpensAt only accompanies CLOSED_HOURS. With delivery on, checkout offers it
// and shows the optional note in the customer's language.
public sealed record OnlineMenuRestaurantResponse(
    Guid Id,
    string Name,
    string CurrencyCode,
    string DefaultLanguage,
    string Theme,
    string? PublicPhone,
    bool DeliveryEnabled,
    string? DeliveryNoteZh,
    string? DeliveryNoteIt,
    string? DeliveryNoteEn
);

public sealed record OnlineMenuResponse(
    OnlineMenuRestaurantResponse Restaurant,
    string Status,
    DateTime? NextOpensAt,
    PublicMenuContent Menu
);

// Items use the QR order line format; Fulfillment is PICKUP or DELIVERY. The address and notes are
// for delivery only. Coupon is null without one.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record OnlineRequestInput(
    [Required] Guid? ClientRequestId,
    string? Fulfillment,
    string? CustomerName,
    string? CustomerPhone,
    string? DeliveryAddress,
    string? DeliveryNotes,
    OrderLineInput?[]? Items,
    OnlineRequestCouponInput? Coupon
);

// The coupon the customer saw at checkout. PercentOff is the confirmed percentage, like a line's expected
// price: a coupon deleted and created again with another percentage is refused rather than applied.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record OnlineRequestCouponInput([Required] string? Code, [Required] int? PercentOff);

// A usable coupon at checkout, before the order is placed.
public sealed record OnlineCouponPreviewResponse(string Code, int PercentOff);

// A coupon applied to an order: DiscountCents is PercentOff of the dishes still charged, rounded down.
public sealed record CouponDiscountResponse(string Code, int PercentOff, long DiscountCents)
{
    public static CouponDiscountResponse? For(string? code, int? percentOff, long itemsCents) =>
        code is not null && percentOff is { } percent
            ? new(code, percent, OnlineCoupons.DiscountCents(itemsCents, percent))
            : null;
}

// The first submission and every repeat of it return the same values.
public sealed record OnlineSubmissionResponse(string StatusToken, int Number, DateTime ExpiresAt);

public sealed record OnlineSubmission(OnlineSubmissionResponse Response, bool Created);

// Id lets the page reuse the customer's language choice for this restaurant.
public sealed record OnlineOrderRestaurantResponse(
    Guid Id,
    string Name,
    string? Slug,
    string CurrencyCode,
    string DefaultLanguage,
    string Theme,
    string? PublicPhone
);

// Status is null before acceptance (the line is the submitted snapshot), then NEW, READY or CANCELLED.
public sealed record OnlineOrderLineResponse(
    string? ItemCode,
    string? NameZh,
    string? NameIt,
    string? NameEn,
    long UnitPriceCents,
    int Quantity,
    string? Remark,
    OrderLineOptionResponse[] Options,
    string? Status
)
{
    // The submitted lines, before acceptance.
    public static OnlineOrderLineResponse[] ForSnapshot(IEnumerable<OrderLineSnapshot> lines) =>
        lines
            .Select(line => new OnlineOrderLineResponse(
                line.ItemCode,
                line.NameZh,
                line.NameIt,
                line.NameEn,
                line.UnitPriceCents,
                line.Quantity,
                line.Remark,
                OrderLineOptionResponse.ForOptions(line.Options),
                null
            ))
            .ToArray();
}

// The customer's status page. Phase is WAITING, EXPIRED, REJECTED or ACCEPTED (OnlineRequestState);
// SessionStatus and CloseReason exist once accepted, and DeliveryFeeCents once a delivery is accepted.
// TotalAmountCents is the submitted item total less the coupon before acceptance, then the session's
// bill amount (with the fee while it counts). It never contains the phone, the address or request IDs.
public sealed record OnlineOrderStatusResponse(
    OnlineOrderRestaurantResponse Restaurant,
    int Number,
    string? CustomerName,
    string Fulfillment,
    DateTime SubmittedAt,
    DateTime ExpiresAt,
    string Phase,
    string? RejectReason,
    DateTime? EstimatedAt,
    string? SessionStatus,
    string? CloseReason,
    OnlineOrderLineResponse[] Items,
    CouponDiscountResponse? Coupon,
    long? DeliveryFeeCents,
    long TotalAmountCents
);
