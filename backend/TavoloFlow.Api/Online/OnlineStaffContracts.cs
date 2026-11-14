using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Online;

// EstimatedMinutes is one of the fixed choices for the request's fulfillment (pickup: 10/20/30/45).
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record OnlineAcceptInput([Required] int? EstimatedMinutes);

// The reason is optional; OUT_OF_RANGE is for delivery only.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record OnlineRejectInput(
    [RegularExpression("^(SOLD_OUT|BUSY|CLOSING|OUT_OF_RANGE)$")] string? Reason
);

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
    long ItemsTotalCents
)
{
    public static OnlinePendingRequestResponse From(OnlineRequest request) =>
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
            request.ItemsTotalCents
        );
}

// Now is the server's clock, so the page shows waiting and remaining time without trusting the device clock.
public sealed record OnlinePendingPage(OnlinePendingRequestResponse[] Items, DateTime Now);

// An accepted online order whose session is still ACTIVE: the only place STAFF see the customer's phone
// and address after acceptance. Progress comes from the item counts (lines, not portions).
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
    int ReadyItemCount
);

public sealed record OnlineActivePage(OnlineActiveOrderResponse[] Items);

// How kitchen and pass screens name an online order: never the phone or the address.
public sealed record OnlineTicketResponse(int Number, string? CustomerName, DateTime EstimatedAt)
{
    public static OnlineTicketResponse? For(DiningSession session) =>
        session.OnlineRequest is { } request
            ? new(request.Number, request.CustomerName, request.EstimatedAt!.Value)
            : null;
}

// The bill adds the phone, so the owner can call a customer who has not come.
public sealed record OnlineBillResponse(
    int Number,
    string? CustomerName,
    string? CustomerPhone,
    DateTime EstimatedAt
);
