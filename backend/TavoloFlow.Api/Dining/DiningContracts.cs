using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using TavoloFlow.Api.Common;

namespace TavoloFlow.Api.Dining;

public sealed record ActiveSessionResponse(
    Guid Id,
    DateTime OpenedAt,
    int OrderCount,
    int NewItemCount,
    long TotalAmountCents
);

public sealed record FloorTableResponse(
    Guid Id,
    string TableLabel,
    bool IsEnabled,
    ActiveSessionResponse? Session
);

public sealed record FloorResponse(
    string ServiceStatus,
    bool OrderingEnabled,
    bool JoinCodeRequired,
    FloorTableResponse[] Tables
);

// JoinCode is null when the restaurant lets guests join without one; the session still stores a code.
public sealed record OpenSessionResponse(BillSummaryResponse Session, string? JoinCode);

public sealed record JoinCodeResponse(Guid SessionId, string JoinCode);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record AcceptingOrdersInput([Required] bool? Enabled);

public sealed record AcceptingOrdersResponse(bool OrderingEnabled);

public static class DiningErrors
{
    public static ApiException RestaurantNotFound() =>
        new(404, "RESTAURANT_NOT_FOUND", "The restaurant doesn't exist.");

    public static ApiException TableNotFound() => new(404, "TABLE_NOT_FOUND", "Table not found.");

    public static ApiException SessionNotFound() =>
        new(404, "SESSION_NOT_FOUND", "Visit not found.");

    public static ApiException SessionClosed() =>
        new(409, "SESSION_CLOSED", "This visit is already closed.");
}
