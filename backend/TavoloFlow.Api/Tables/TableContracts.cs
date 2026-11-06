using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using TavoloFlow.Api.Common;

namespace TavoloFlow.Api.Tables;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record TableLabelInput(string? TableLabel);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record TableEnabledInput([Required] bool? IsEnabled);

public sealed record TableResponse(
    Guid Id,
    string TableLabel,
    bool IsEnabled,
    string QrPath,
    Guid? ActiveSessionId
);

public static class TableErrors
{
    public static ApiException NotFound() =>
        new(404, "TABLE_NOT_FOUND", "Table not found. Refresh the list.");

    public static ApiException LabelConflict() =>
        new(
            409,
            "TABLE_LABEL_CONFLICT",
            "A table with this label already exists.",
            new Dictionary<string, string[]> { ["tableLabel"] = ["Use a different table label."] }
        );
}
