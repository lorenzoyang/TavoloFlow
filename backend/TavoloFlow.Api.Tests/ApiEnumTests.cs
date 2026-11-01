using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Tests;

public sealed class ApiEnumTests
{
    [Fact]
    public void Text_ExistingPersistedEnums_RetainsStoredNamesAndParsing()
    {
        Check<RestaurantServiceStatus>(); Check<RestaurantTheme>(); Check<RestaurantUserRole>();
        Check<DiningSessionStatus>(); Check<OrderStatus>(); Check<OrderItemStatus>();
        foreach (var value in new[] { SessionCloseReason.Paid, SessionCloseReason.Voided, SessionCloseReason.Empty })
        {
            var text = value.ToString().ToUpperInvariant();
            Assert.Equal(text, ApiEnum.Text(value));
            Assert.True(ApiEnum.TryParse(text, out SessionCloseReason restored));
            Assert.Equal(value, restored);
        }
        static void Check<T>() where T : struct, Enum
        {
            foreach (var value in Enum.GetValues<T>())
            {
                var text = value.ToString().ToUpperInvariant();
                Assert.Equal(text, ApiEnum.Text(value));
                Assert.True(ApiEnum.TryParse(text, out T restored));
                Assert.Equal(value, restored);
            }
        }
    }

    [Fact]
    public void Text_MultiWordName_SplitsWordsWithUnderscores()
    {
        Assert.Equal("DINE_IN", ApiEnum.Text(SessionChannel.DineIn));
        Assert.Equal("PICKUP", ApiEnum.Text(SessionChannel.Pickup));
        Assert.Equal("CANCELLED", ApiEnum.Text(OrderItemStatus.Cancelled));
    }

    [Theory]
    [InlineData("DINE_IN", true)]
    [InlineData("DINEIN", false)]
    [InlineData("dine_in", false)]
    [InlineData("Dine_In", false)]
    [InlineData("0", false)]
    [InlineData(" DINE_IN", false)]
    [InlineData(null, false)]
    public void TryParse_OnlyExactNames_Succeeds(string? text, bool parsed)
    {
        Assert.Equal(parsed, ApiEnum.TryParse(text, out SessionChannel channel));
        if (parsed) Assert.Equal(SessionChannel.DineIn, channel);
    }
}
