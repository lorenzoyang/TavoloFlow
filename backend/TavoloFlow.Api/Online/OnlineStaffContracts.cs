using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Online;

// EstimatedMinutes is one of the fixed choices for the request's fulfillment (pickup: 10/20/30/45,
// delivery: 30/45/60/90). For manual delivery, send the current band's upper distance and the fee
// shown to staff. Legacy clients can send just the fee when there are no free-delivery thresholds.
// Pickup and already quoted deliveries take neither field.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record OnlineAcceptInput(
    [Required] int? EstimatedMinutes,
    long? DeliveryFeeCents = null,
    int? DeliveryTierMaxMeters = null
);

// The reason is optional; OUT_OF_RANGE is for delivery only.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record OnlineRejectInput(
    [RegularExpression("^(SOLD_OUT|BUSY|CLOSING|OUT_OF_RANGE)$")] string? Reason
);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record OnlineCancelReservationInput(string? Reason);

// One request waiting for staff, with everything needed to decide: contact, address and the submitted lines.
public sealed record OnlinePendingRequestResponse(
    Guid Id,
    int Number,
    string Fulfillment,
    string? CustomerName,
    string? CustomerPhone,
    string? DeliveryAddress,
    string? DeliveryNotes,
    DateTime SubmittedAt,
    DateTime ExpiresAt,
    string DefaultLanguage,
    OnlineOrderLineResponse[] Items,
    long ItemsTotalCents,
    // ItemsTotalCents is before the coupon; the discount comes off it, and acceptance adds any fee.
    CouponDiscountResponse? Coupon,
    // Both set when the customer accepted an automatic quote, which acceptance keeps; both null when
    // whoever accepts picks the band.
    long? DeliveryFeeCents,
    int? DeliveryDistanceMeters,
    DateTime? RequestedPickupAt,
    int[]? AvailablePreparationMinutes
)
{
    public static OnlinePendingRequestResponse From(OnlineRequest request, int[]? minutes) =>
        new(
            request.Id,
            request.Number,
            ApiEnum.Text(request.Fulfillment),
            request.CustomerName,
            request.CustomerPhone,
            request.DeliveryAddress,
            request.DeliveryNotes,
            request.SubmittedAt,
            request.ExpiresAt,
            request.DefaultLanguageSnapshot,
            OnlineOrderLineResponse.ForSnapshot(request.Lines),
            request.ItemsTotalCents,
            CouponDiscountResponse.For(
                request.CouponCode,
                request.CouponPercentOff,
                request.ItemsTotalCents
            ),
            request.DeliveryFeeCents,
            request.DeliveryDistanceMeters,
            request.RequestedPickupAt,
            minutes
        );
}

// Now is the server's clock, so the page shows waiting and remaining time without trusting the device clock.
// Delivery is set while a delivery request waits: whoever accepts picks one of the restaurant's current
// fee bands, judging the distance on a route drawn from its coordinates.
public sealed record OnlinePendingPage(
    OnlinePendingRequestResponse[] Items,
    DateTime Now,
    OnlinePendingDelivery? Delivery
);

public sealed record OnlinePendingDelivery(
    decimal? OriginLat,
    decimal? OriginLng,
    DeliveryTierResponse[] Tiers
);

// An accepted online order whose session is still ACTIVE: the only place STAFF see the customer's phone
// and address after acceptance, and the amount a rider collects. Built from the session's bill summary,
// so the amount follows the bill's single rule. Progress comes from the item counts (lines, not
// portions); an online session is opened at its acceptance.
public sealed record OnlineActiveOrderResponse(
    Guid SessionId,
    int Number,
    string Channel,
    string? CustomerName,
    string? CustomerPhone,
    string? DeliveryAddress,
    string? DeliveryNotes,
    DateTime AcceptedAt,
    DateTime EstimatedAt,
    int ItemCount,
    int NewItemCount,
    int ReadyItemCount,
    CouponDiscountResponse? Coupon,
    long? DeliveryFeeCents,
    long TotalAmountCents,
    DateTime? RequestedPickupAt,
    DateTime? KitchenStartsAt,
    bool AwaitingPreparation
)
{
    public static OnlineActiveOrderResponse From(BillSummaryResponse bill, DateTime now)
    {
        var online =
            bill.Online
            ?? throw new InvalidOperationException("An online order's bill names its request.");
        return new(
            bill.SessionId,
            online.Number,
            bill.Channel,
            online.CustomerName,
            online.CustomerPhone,
            online.DeliveryAddress,
            online.DeliveryNotes,
            bill.OpenedAt,
            online.EstimatedAt,
            bill.ItemCount,
            bill.NewItemCount,
            bill.ItemCount - bill.NewItemCount - bill.CancelledItemCount,
            online.Coupon,
            bill.DeliveryFeeCents,
            bill.TotalAmountCents,
            online.RequestedPickupAt,
            online.KitchenStartsAt,
            online.KitchenStartsAt > now
        );
    }
}

public sealed record OnlineActivePage(OnlineActiveOrderResponse[] Items);

// How kitchen and pass screens name an online order: never the phone or the address.
public sealed record OnlineTicketResponse(
    int Number,
    string? CustomerName,
    DateTime EstimatedAt,
    DateTime? RequestedPickupAt = null
)
{
    public static OnlineTicketResponse? For(DiningSession session) =>
        session.OnlineRequest is { } request
            ? new(
                request.Number,
                request.CustomerName,
                request.EstimatedAt!.Value,
                request.RequestedPickupAt
            )
            : null;
}

// The bill adds the phone, so the owner can call a customer who has not come, and for delivery the
// address and doorbell notes. Coupon is the one used at submission, with its discount on the dishes
// still charged; the bill's TotalAmountCents already takes it off.
public sealed record OnlineBillResponse(
    int Number,
    string? CustomerName,
    string? CustomerPhone,
    DateTime EstimatedAt,
    string? DeliveryAddress,
    string? DeliveryNotes,
    CouponDiscountResponse? Coupon,
    DateTime? RequestedPickupAt = null,
    DateTime? KitchenStartsAt = null
);
