using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.DataProtection;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Dining;

public sealed class JoinCodes(IDataProtectionProvider protection)
{
    public const string Alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

    public string Generate() =>
        new(
            Enumerable
                .Range(0, 4)
                .Select(_ => Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)])
                .ToArray()
        );

    private IDataProtector Protector(DiningSession session) =>
        protection.CreateProtector(
            "TavoloFlow.Dining.JoinCode.v1",
            session.RestaurantId.ToString(),
            session.TableId.ToString()!,
            session.Id.ToString()
        );

    public string Encrypt(DiningSession session, string code) => Protector(session).Protect(code);

    public string Read(DiningSession session)
    {
        if (session.Status != DiningSessionStatus.Active || session.JoinCodeCiphertext is null)
            throw DiningErrors.SessionClosed();
        try
        {
            return Protector(session).Unprotect(session.JoinCodeCiphertext);
        }
        catch (CryptographicException)
        {
            throw new ApiException(
                503,
                "JOIN_CODE_UNAVAILABLE",
                "The join code can't be read right now. Ask the staff."
            );
        }
    }

    public bool Matches(DiningSession session, string input) =>
        CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(Read(session)),
            Encoding.UTF8.GetBytes(input)
        );
}
