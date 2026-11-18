using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using TavoloFlow.Api.Common;

namespace TavoloFlow.Api.Online;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record OnlineHourInput(
    [Required] int? Weekday,
    [Required] int? OpensMinute,
    [Required] int? ClosesMinute
);

// The whole week at once; an empty list removes every slot.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record OnlineHoursInput([Required] OnlineHourInput?[]? Slots);

// Blank clears the phone, which stops online orders.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record PublicPhoneInput(
    [StringLength(InputRules.MaxPhoneInputLength)] string? PublicPhone
);

// SLOT pauses until the current slot ends; TODAY until the next local midnight.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record OnlinePauseInput(
    [Required, RegularExpression("^(SLOT|TODAY)$")] string? Until
);

// One fee band: up to MaxMeters of road distance, FeeCents (0 for free).
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record DeliveryTierInput([Required] int? MaxMeters, [Required] long? FeeCents);

// Delivery: the switch, the optional note per language, the optional minimum order, the restaurant's
// coordinates and the fee bands (an empty list for none), replaced together. Blank notes are stored as
// NULL; turning delivery off keeps the rest for the next time. Turning it on needs the coordinates and
// at least one band.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record OnlineDeliveryInput(
    [Required] bool? Enabled,
    string? NoteZh,
    string? NoteIt,
    string? NoteEn,
    long? MinOrderCents,
    decimal? OriginLat,
    decimal? OriginLng,
    [Required] DeliveryTierInput?[]? Tiers
);

// Nearest first; the last one is the farthest the restaurant delivers.
public sealed record DeliveryTierResponse(int MaxMeters, long FeeCents);

// A new coupon: the code customers type (trimmed and uppercased), the percentage off the dishes and an
// optional last local day, not before today. Coupons are never edited: delete one and create another.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record OnlineCouponInput(
    [Required] string? Code,
    [Required] int? PercentOff,
    DateOnly? ValidUntil
);

public sealed record OnlineHourResponse(int Weekday, int OpensMinute, int ClosesMinute);

// Expired compares ValidUntil with the restaurant's local date, so the page needs neither clock nor zone.
public sealed record OnlineCouponResponse(
    Guid Id,
    string Code,
    int PercentOff,
    DateOnly? ValidUntil,
    bool Expired
);

// Hours are ordered by weekday and opening time. PausedUntil is null once the pause has lapsed.
// CurrentSlotEndsAt is set while a slot accepts orders, so the page can offer "pause until then".
// Delivery does not affect Status: pickup stays possible whether or not the restaurant delivers.
// Coupons are ordered by code.
public sealed record OnlineSettingsResponse(
    string? Slug,
    string? PublicPhone,
    OnlineHourResponse[] Hours,
    DateTime? PausedUntil,
    string Status,
    DateTime? NextOpensAt,
    DateTime? CurrentSlotEndsAt,
    bool DeliveryEnabled,
    string? DeliveryNoteZh,
    string? DeliveryNoteIt,
    string? DeliveryNoteEn,
    long? DeliveryMinOrderCents,
    decimal? DeliveryOriginLat,
    decimal? DeliveryOriginLng,
    DeliveryTierResponse[] DeliveryTiers,
    OnlineCouponResponse[] Coupons
);

public static class OnlineErrors
{
    public static ApiException VerificationFailed() =>
        new(
            400,
            "ONLINE_VERIFICATION_FAILED",
            "Complete a fresh security verification before submitting."
        );

    public static ApiException VerificationUnavailable() =>
        new(
            503,
            "ONLINE_VERIFICATION_UNAVAILABLE",
            "Security verification is temporarily unavailable. Check the original result before retrying."
        );

    public static ApiException BrowserRequired() =>
        new(
            400,
            "ONLINE_BROWSER_REQUIRED",
            "Allow this site's cookies and reload before ordering."
        );

    public static ApiException BrowserPending(OnlineSubmissionResponse existing) =>
        new(
            409,
            "ONLINE_BROWSER_PENDING",
            "This browser already has an order waiting at this restaurant."
        )
        {
            Extensions = new() { ["existingSubmission"] = existing },
        };

    public static ApiException IpWaitingLimit() =>
        new(
            409,
            "ONLINE_IP_WAITING_LIMIT",
            "Too many orders from this connection are waiting. Try again shortly."
        );

    public static ApiException NotOffered() =>
        new(409, "ONLINE_NOT_OFFERED", "This restaurant doesn't offer online ordering.");

    // NextOpensAt (UTC), when the week has another slot, lets the customer page say when to come back.
    public static ApiException Closed(DateTime? nextOpensAt = null) =>
        new(409, "ONLINE_CLOSED", "Online ordering is outside its hours right now.")
        {
            Extensions = nextOpensAt is { } next ? new() { ["nextOpensAt"] = next } : null,
        };

    public static ApiException Paused() =>
        new(409, "ONLINE_PAUSED", "The restaurant has paused online ordering.");

    public static ApiException Busy() =>
        new(
            409,
            "ONLINE_BUSY",
            "The restaurant has too many orders waiting. Try again shortly or call the restaurant."
        );

    public static ApiException DeliveryNotOffered() =>
        new(409, "DELIVERY_NOT_OFFERED", "This restaurant doesn't deliver online orders.");

    // After the duplicate check, like COUPON_INVALID: nothing was stored. Ask for a new quote.
    public static ApiException DeliveryQuoteInvalid() =>
        new(
            409,
            "DELIVERY_QUOTE_INVALID",
            "The delivery quote has expired or no longer matches this address or the restaurant's fees."
        );

    // After the duplicate check, like COUPON_INVALID: nothing was stored. The menu carries the minimum.
    public static ApiException DeliveryMinOrder() =>
        new(
            409,
            "DELIVERY_MIN_ORDER",
            "The dishes, after any coupon, are below the restaurant's minimum for delivery."
        );

    // Customers: the code doesn't exist, has expired or now has another percentage. The preview answers 404;
    // a submission answers 409 after its duplicate check, so nothing was stored.
    public static ApiException CouponNotFound() =>
        new(404, "COUPON_INVALID", "This coupon code isn't valid at this restaurant today.");

    public static ApiException CouponInvalid() =>
        new(
            409,
            "COUPON_INVALID",
            "This coupon code isn't valid any more. Remove it and check the total again."
        );

    public static ApiException CouponCodeTaken() =>
        new(409, "COUPON_CODE_TAKEN", "This restaurant already has a coupon with this code.");

    public static ApiException CouponLimit() =>
        new(
            409,
            "COUPON_LIMIT",
            $"A restaurant keeps at most {OnlineCoupons.MaxCoupons} coupons. Delete one first."
        );

    public static ApiException Suspended() =>
        new(409, "SERVICE_SUSPENDED", "The restaurant's service is suspended.");

    public static ApiException LinkNotFound() =>
        new(404, "ONLINE_LINK_NOT_FOUND", "This online ordering link doesn't exist.");

    public static ApiException RequestNotFound() =>
        new(
            404,
            "ONLINE_REQUEST_NOT_FOUND",
            "This submission hasn't been found yet. Keep checking, or retry with the original request."
        );

    // Staff: the request is no longer waiting (accepted or rejected by someone else, or expired).
    public static ApiException RequestChanged() =>
        new(
            409,
            "ONLINE_REQUEST_CHANGED",
            "This online request is no longer waiting. Reload the list."
        );

    // Staff: no such request in this restaurant.
    public static ApiException RequestMissing() =>
        new(404, "ONLINE_REQUEST_NOT_FOUND", "This online request doesn't exist.");

    public static ApiException OrderNotFound() =>
        new(404, "ONLINE_ORDER_NOT_FOUND", "This online order doesn't exist or has ended.");

    // Maps every status but OPEN to the error a submission returns.
    public static ApiException NotOpen(OnlineAvailabilityResult availability) =>
        availability.Status switch
        {
            OnlineStatus.Suspended => Suspended(),
            OnlineStatus.NotOffered => NotOffered(),
            OnlineStatus.Paused => Paused(),
            OnlineStatus.ClosedHours => Closed(availability.NextOpensAt),
            OnlineStatus.Busy => Busy(),
            _ => throw new InvalidOperationException($"{availability.Status} accepts orders."),
        };
}
