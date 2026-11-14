using System.Security.Cryptography;
using Microsoft.AspNetCore.WebUtilities;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Tests;

// Online requests and accepted online sessions written straight to the database, for tests that need
// them before (or without) the submission and acceptance endpoints.
internal static class OnlineTestData
{
    public static OrderLineSnapshot Line(
        Guid menuItemId,
        long unitPriceCents = 1200,
        int quantity = 2
    ) =>
        new()
        {
            MenuItemId = menuItemId,
            ItemCode = "R1",
            NameZh = "拉面",
            NameIt = "Ramen",
            NameEn = "Ramen",
            AllergenCodes = ["GLUTEN"],
            UnitPriceCents = unitPriceCents,
            Quantity = quantity,
            Remark = "Senza cipolla",
            Options =
            [
                new OrderItemOption
                {
                    GroupNameIt = "Piccantezza",
                    NameIt = "Media",
                    PriceDeltaCents = 0,
                },
            ],
        };

    // A pickup request submitted at submittedAt; it waits for ten minutes. Numbers must be distinct per day.
    public static OnlineRequest Request(
        Guid restaurantId,
        DateTime submittedAt,
        int number,
        Guid? menuItemId = null
    )
    {
        var line = Line(menuItemId ?? Guid.NewGuid());
        return new OnlineRequest
        {
            Id = Guid.CreateVersion7(),
            RestaurantId = restaurantId,
            ClientRequestId = Guid.NewGuid(),
            StatusToken = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32)),
            BusinessDate = DateOnly.FromDateTime(submittedAt),
            Number = number,
            Fulfillment = OnlineFulfillment.Pickup,
            CustomerName = "Marco",
            CustomerPhone = "+393331234567",
            Lines = [line],
            ItemsTotalCents = line.UnitPriceCents * line.Quantity,
            DefaultLanguageSnapshot = "it",
            SubmittedAt = submittedAt,
            ExpiresAt = submittedAt.AddMinutes(10),
        };
    }

    // Marks the request accepted and returns the ACTIVE pickup session with its single order; add all three.
    public static DiningSession Accept(
        OnlineRequest request,
        DateTime acceptedAt,
        bool menuItemExists
    )
    {
        var session = new DiningSession
        {
            Id = Guid.CreateVersion7(),
            RestaurantId = request.RestaurantId,
            Channel = SessionChannel.Pickup,
            OpenedAt = acceptedAt,
        };
        var order = new Order
        {
            Id = Guid.CreateVersion7(),
            RestaurantId = request.RestaurantId,
            DiningSession = session,
            ClientRequestId = request.ClientRequestId,
            TotalAmountCents = request.ItemsTotalCents,
            DefaultLanguageSnapshot = request.DefaultLanguageSnapshot,
            CreatedAt = acceptedAt,
        };
        foreach (var line in request.Lines)
            order.Items.Add(line.ToOrderItem(request.RestaurantId, menuItemExists));
        session.Orders.Add(order);
        request.AcceptedAt = acceptedAt;
        request.EstimatedAt = acceptedAt.AddMinutes(20);
        request.Session = session;
        return session;
    }
}
