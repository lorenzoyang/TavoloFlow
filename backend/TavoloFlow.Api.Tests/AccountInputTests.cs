using TavoloFlow.Api.Accounts;

namespace TavoloFlow.Api.Tests;

public sealed class AccountInputTests
{
    [Theory]
    [InlineData(" OWNER ", "owner")]
    [InlineData("\tStAfF\r\n", "staff")]
    [InlineData("Front Desk", "front desk")]
    public void NormalizeUsername_CaseAndWhitespace_ReturnsNormalizedUsername(
        string username,
        string expected
    ) => Assert.Equal(expected, AccountInput.NormalizeUsername(username));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("\t\r\n")]
    [InlineData("\u3000")]
    public void IsValidUsername_NullOrBlank_ReturnsFalse(string? username) =>
        Assert.False(AccountInput.IsValidUsername(username));

    [Theory]
    [InlineData(1, true)]
    [InlineData(50, true)]
    [InlineData(51, false)]
    public void IsValidUsername_SurroundingWhitespace_EnforcesNormalizedLength(
        int length,
        bool expected
    ) => Assert.Equal(expected, AccountInput.IsValidUsername($"\t{new string('A', length)} \r\n"));
}
