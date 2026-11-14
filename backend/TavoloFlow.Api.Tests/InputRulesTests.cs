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

    [Theory]
    [InlineData("abc", true)]
    [InlineData("ramen-da-mario", true)]
    [InlineData("a1-2b", true)]
    [InlineData("a--b", true)]
    [InlineData("ab", false)]
    [InlineData("-abc", false)]
    [InlineData("abc-", false)]
    [InlineData("Abc", false)]
    [InlineData("ab c", false)]
    [InlineData(" abc", false)]
    [InlineData("caffè", false)]
    [InlineData("ab_c", false)]
    [InlineData(null, false)]
    public void IsSlug_Value_AcceptsOnlyLowercaseLettersDigitsAndInnerHyphens(
        string? value,
        bool expected
    ) => Assert.Equal(expected, InputRules.IsSlug(value));

    [Theory]
    [InlineData(40, true)]
    [InlineData(41, false)]
    public void IsSlug_Length_AllowsAtMostForty(int length, bool expected) =>
        Assert.Equal(expected, InputRules.IsSlug(new string('a', length)));
}
