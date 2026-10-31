using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Pickup;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record PickupHourInput(int Weekday, int Slot, int OpensMinute, int ClosesMinute);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record PickupHoursInput([Required] PickupHourInput?[]? Hours);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record PickupPausedInput([Required] bool? Paused);

public sealed record PickupHourResponse(int Weekday, int Slot, int OpensMinute, int ClosesMinute)
{
    public static PickupHourResponse From(PickupHour hour) => new(hour.Weekday, hour.Slot, hour.OpensMinute, hour.ClosesMinute);
}

// Status is the current availability; NextOpensAt is set while it is CLOSED_HOURS and an opening falls within seven days.
public sealed record PickupSettingsResponse(bool PickupEnabled, string? Slug, string? Phone, bool Paused,
    PickupHourResponse[] Hours, string Status, DateTime? NextOpensAt, string TimeZone);

public static class PickupErrors
{
    public static ApiException NotOffered() => new(409, "PICKUP_NOT_OFFERED", "这家餐厅暂不提供线上点单。");
}
