using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using TavoloFlow.Api.Common;

namespace TavoloFlow.Api.Online;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record OnlineHourInput(
    [Required] int? Weekday,
    [Required] int? OpensMinute,
    [Required] int? ClosesMinute
);

// The whole week at once; an empty list removes every slot.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record OnlineHoursInput([Required] OnlineHourInput?[]? Slots);

// Blank clears the phone, which stops online orders.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record PublicPhoneInput(
    [StringLength(InputRules.MaxPhoneInputLength)] string? PublicPhone
);

// SLOT pauses until the current slot ends; TODAY until the next local midnight.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record OnlinePauseInput(
    [Required, RegularExpression("^(SLOT|TODAY)$")] string? Until
);

public sealed record OnlineHourResponse(int Weekday, int OpensMinute, int ClosesMinute);

// Hours are ordered by weekday and opening time. PausedUntil is null once the pause has lapsed.
// CurrentSlotEndsAt is set while a slot accepts orders, so the page can offer "pause until then".
public sealed record OnlineSettingsResponse(
    string? Slug,
    string? PublicPhone,
    OnlineHourResponse[] Hours,
    DateTime? PausedUntil,
    string Status,
    DateTime? NextOpensAt,
    DateTime? CurrentSlotEndsAt
);

public static class OnlineErrors
{
    public static ApiException NotOffered() =>
        new(409, "ONLINE_NOT_OFFERED", "This restaurant doesn't offer online ordering.");

    public static ApiException Closed() =>
        new(409, "ONLINE_CLOSED", "Online ordering is outside its hours right now.");
}
