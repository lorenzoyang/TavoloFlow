using TavoloFlow.Api.Accounts;

namespace TavoloFlow.Api.Tests;

public sealed class PasswordPolicyTests
{
    [Theory]
    [InlineData("123456", true)]
    [InlineData("abcdef", true)]
    [InlineData(" 1234 ", true)]
    [InlineData("12345", false)]
    [InlineData("      ", false)]
    [InlineData("\t\r\n   ", false)]
    public void IsValidPassword_LengthAndNonblankRules_AcceptsShortNumericPasswords(
        string password,
        bool expected
    ) => Assert.Equal(expected, AccountInput.IsValidPassword(password));

    [Theory]
    [InlineData(128, true)]
    [InlineData(129, false)]
    public void IsValidPassword_MaximumLength_PreservesLongPasswordSupport(
        int length,
        bool expected
    ) => Assert.Equal(expected, AccountInput.IsValidPassword(new string('a', length)));
}
