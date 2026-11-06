namespace TavoloFlow.Api.Tests;

public sealed class InputRulesTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("\t\r\n")]
    [InlineData("\u3000")]
    public void IsRestaurantName_NullOrBlank_ReturnsFalse(string? name) =>
        Assert.False(InputRules.IsRestaurantName(name));

    [Theory]
    [InlineData(1, true)]
    [InlineData(150, true)]
    [InlineData(151, false)]
    public void IsRestaurantName_SurroundingWhitespace_EnforcesTrimmedLength(
        int length,
        bool expected
    ) => Assert.Equal(expected, InputRules.IsRestaurantName($"\t{new string('餐', length)} \r\n"));
}
