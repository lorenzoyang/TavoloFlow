using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using TavoloFlow.Api.Common;

namespace TavoloFlow.Api.Guests;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
// JoinCode is required only by restaurants that keep join codes on; others ignore it.
public sealed record JoinInput(
    [Required] Guid? SessionId,
    [StringLength(32)] string? JoinCode = null
);

public sealed record JoinResponse(Guid RestaurantId, Guid TableId, Guid SessionId);

public sealed record GuestAccessResponse(
    Guid RestaurantId,
    Guid TableId,
    Guid SessionId,
    string Status,
    string ServiceStatus,
    bool IsTableEnabled,
    bool OrderingEnabled
);

public static class GuestErrors
{
    public static ApiException AuthRequired() =>
        new(401, "GUEST_AUTH_REQUIRED", "Verify this visit's join code.");

    public static ApiException SessionMismatch() =>
        new(
            403,
            "GUEST_SESSION_MISMATCH",
            "This browser's access belongs to another visit. Verify again."
        );

    public static ApiException QrNotFound() =>
        new(404, "QR_NOT_FOUND", "Invalid QR code. Ask the staff.");
}
