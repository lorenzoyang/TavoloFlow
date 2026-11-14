using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Tests;

public sealed class ApiEnumTests
{
    [Theory]
    [InlineData(SessionChannel.DineIn, "DINE_IN")]
    [InlineData(SessionChannel.Pickup, "PICKUP")]
    [InlineData(SessionCloseReason.NoShow, "NO_SHOW")]
    [InlineData(OnlineRejectReason.OutOfRange, "OUT_OF_RANGE")]
    [InlineData(OrderItemStatus.Cancelled, "CANCELLED")]
    public void Text_MultiWordNames_UseUppercaseWithUnderscores(Enum value, string text)
    {
        var actual = value switch
        {
            SessionChannel channel => (
                ApiEnum.Text(channel),
                ApiEnum.Parse<SessionChannel>(text) == channel
            ),
            SessionCloseReason reason => (
                ApiEnum.Text(reason),
                ApiEnum.Parse<SessionCloseReason>(text) == reason
            ),
            OnlineRejectReason reason => (
                ApiEnum.Text(reason),
                ApiEnum.Parse<OnlineRejectReason>(text) == reason
            ),
            OrderItemStatus status => (
                ApiEnum.Text(status),
                ApiEnum.Parse<OrderItemStatus>(text) == status
            ),
            _ => throw new ArgumentOutOfRangeException(nameof(value)),
        };
        Assert.Equal((text, true), actual);
    }

    [Theory]
    [InlineData("DINE_IN", true)]
    [InlineData("DINEIN", false)]
    [InlineData("dine_in", false)]
    [InlineData("DINE__IN", false)]
    [InlineData("_DINE_IN", false)]
    [InlineData("0", false)]
    [InlineData(null, false)]
    public void TryParse_OnlyTheExactText_IsAccepted(string? text, bool accepted)
    {
        Assert.Equal(accepted, ApiEnum.TryParse(text, out SessionChannel channel));
        if (accepted)
            Assert.Equal(SessionChannel.DineIn, channel);
    }
}
