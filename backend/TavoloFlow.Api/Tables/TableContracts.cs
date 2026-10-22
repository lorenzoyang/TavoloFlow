using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace TavoloFlow.Api.Tables;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record TableLabelInput(string? TableLabel);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record TableEnabledInput([Required] bool? IsEnabled);

public sealed record TableResponse(Guid Id, string TableLabel, bool IsEnabled, string QrPath, Guid? ActiveSessionId);
