using System.Collections;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Tests;

public sealed class OrderLineSnapshotTests(PostgreSqlFixture database)
    : IClassFixture<PostgreSqlFixture>
{
    // OrderItem properties that are not part of the dish snapshot: identity, tenancy and kitchen state.
    private static readonly string[] NotSnapshot =
    [
        nameof(OrderItem.Id),
        nameof(OrderItem.RestaurantId),
        nameof(OrderItem.OrderId),
        nameof(OrderItem.Status),
        nameof(OrderItem.ReadyAt),
        nameof(OrderItem.CancelledAt),
        nameof(OrderItem.ServedAt),
        nameof(OrderItem.Restaurant),
        nameof(OrderItem.Order),
        nameof(OrderItem.MenuItem),
    ];

    [Fact]
    public void ToOrderItem_EverySnapshotField_ComesFromTheLine()
    {
        var line = OnlineTestData.Line(Guid.NewGuid(), unitPriceCents: 1450, quantity: 3);
        var restaurantId = Guid.NewGuid();
        var item = line.ToOrderItem(restaurantId, menuItemExists: true);

        var snapshotFields = typeof(OrderItem)
            .GetProperties()
            .Where(property => !NotSnapshot.Contains(property.Name))
            .ToArray();
        // Every snapshot field of an order item has its own field in the line, and none is left unset.
        // A new OrderItem snapshot field fails here until OrderLineSnapshot and ToOrderItem carry it.
        Assert.Equal(typeof(OrderLineSnapshot).GetProperties().Length, snapshotFields.Length);
        foreach (var property in typeof(OrderLineSnapshot).GetProperties())
            Assert.False(
                IsUnset(property.GetValue(line)),
                $"Test line leaves {property.Name} unset."
            );
        foreach (var property in snapshotFields)
            Assert.False(
                IsUnset(property.GetValue(item)),
                $"ToOrderItem leaves {property.Name} unset."
            );

        Assert.Equal(
            new object?[]
            {
                line.MenuItemId,
                line.ItemCode,
                line.NameZh,
                line.NameIt,
                line.NameEn,
                line.UnitPriceCents,
                line.Quantity,
                line.Remark,
            },
            new object?[]
            {
                item.MenuItemId,
                item.ItemCodeSnapshot,
                item.NameZhSnapshot,
                item.NameItSnapshot,
                item.NameEnSnapshot,
                item.UnitPriceCents,
                item.Quantity,
                item.Remark,
            }
        );
        Assert.Equal(line.AllergenCodes, item.AllergenCodesSnapshot);
        Assert.Equal(
            JsonSerializer.Serialize(line.Options),
            JsonSerializer.Serialize(item.OptionsSnapshot)
        );
        Assert.Equal(restaurantId, item.RestaurantId);
        Assert.Equal(OrderItemStatus.New, item.Status);
        // The item gets copies, so later changes to either never leak into the other.
        Assert.NotSame(line.AllergenCodes, item.AllergenCodesSnapshot);
        Assert.NotSame(line.Options[0], item.OptionsSnapshot[0]);
    }

    [Fact]
    public void ToOrderItem_DeletedDish_KeepsTheNamesWithoutTheMenuLink()
    {
        var line = OnlineTestData.Line(Guid.NewGuid());
        var item = line.ToOrderItem(Guid.NewGuid(), menuItemExists: false);
        Assert.Null(item.MenuItemId);
        Assert.Equal(line.NameIt, item.NameItSnapshot);
    }

    [Fact]
    public async Task Lines_SavedAsJson_RoundTripEveryField()
    {
        var restaurant = new Restaurant
        {
            Id = Guid.NewGuid(),
            Name = "Snapshot",
            DefaultLanguage = "it",
        };
        var request = OnlineTestData.Request(restaurant.Id, DateTime.UtcNow, number: 1);
        var second = OnlineTestData.Line(Guid.NewGuid(), unitPriceCents: 450, quantity: 1);
        second.ItemCode = null;
        second.NameZh = null;
        second.Remark = null;
        second.AllergenCodes = [];
        second.Options =
        [
            new OrderItemOption
            {
                GroupNameZh = "加料",
                GroupNameEn = "Extras",
                NameZh = "溏心蛋",
                NameEn = "Soft egg",
                PriceDeltaCents = 150,
            },
            new OrderItemOption
            {
                GroupNameEn = "Extras",
                NameEn = "Nori",
                PriceDeltaCents = 50,
            },
        ];
        request.Lines.Add(second);
        await using (var setup = database.CreateContext())
        {
            setup.Restaurants.Add(restaurant);
            setup.OnlineRequests.Add(request);
            await setup.SaveChangesAsync();
        }

        await using var context = database.CreateContext();
        var saved = await context
            .OnlineRequests.AsNoTracking()
            .SingleAsync(r => r.Id == request.Id);
        Assert.Equal(
            JsonSerializer.Serialize(request.Lines),
            JsonSerializer.Serialize(saved.Lines)
        );
        var json = await context
            .Database.SqlQuery<string>(
                $"SELECT lines::text AS \"Value\" FROM online_requests WHERE id = {request.Id}"
            )
            .SingleAsync();
        using var document = JsonDocument.Parse(json);
        var first = document.RootElement[0];
        Assert.Equal(request.Lines[0].MenuItemId, first.GetProperty("menuItemId").GetGuid());
        Assert.Equal("GLUTEN", first.GetProperty("allergenCodes")[0].GetString());
        Assert.Equal("Media", first.GetProperty("options")[0].GetProperty("nameIt").GetString());
    }

    private static bool IsUnset(object? value) =>
        value switch
        {
            null => true,
            Guid guid => guid == Guid.Empty,
            long number => number == 0,
            int number => number == 0,
            string text => text.Length == 0,
            ICollection collection => collection.Count == 0,
            _ => false,
        };
}
