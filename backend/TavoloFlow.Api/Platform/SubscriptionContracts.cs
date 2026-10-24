using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Platform;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record InitialSubscriptionPeriod(Guid Id, DateOnly StartsOn, DateOnly EndsOn, int Years,
    long AmountCents, DateOnly? PaidOn = null);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record SubscriptionMetadataInput(int ExpectedVersion,
    [StringLength(500)] string? OwnerContact, long? DefaultAnnualFeeCents);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record SubscriptionPeriodInput(int ExpectedVersion, Guid Id,
    DateOnly StartsOn, DateOnly EndsOn, int Years, long AmountCents, DateOnly? PaidOn = null);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record SubscriptionPeriodEditInput(int ExpectedVersion,
    DateOnly StartsOn, DateOnly EndsOn, int Years, long AmountCents);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record SubscriptionExpiryInput(int ExpectedVersion, DateOnly EndsOn);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record SubscriptionPaymentInput(int ExpectedVersion, DateOnly PaidOn);

public sealed record SubscriptionSummary(string? OwnerContact, long? DefaultAnnualFeeCents, int Version,
    string ServiceState, DateOnly? StartsOn, DateOnly? ExpiresOn, string? PaymentState,
    int UnpaidPeriodCount, bool DueSoon, DateOnly LocalToday)
{
    // Platform restaurant-list filters.
    public static readonly string[] Filters = ["UNPAID", "DUE_SOON", "EXPIRED", "UNCONFIGURED"];

    public bool Matches(string filter) => filter switch
    {
        "UNPAID" => UnpaidPeriodCount > 0,
        "DUE_SOON" => DueSoon,
        "EXPIRED" => ServiceState == "EXPIRED",
        "UNCONFIGURED" => ServiceState == "UNCONFIGURED",
        _ => false
    };
}

public sealed record SubscriptionPeriodResponse(Guid Id, DateOnly StartsOn, DateOnly EndsOn, int Years,
    long AmountCents, DateOnly? PaidOn, bool IsPaid)
{
    public static SubscriptionPeriodResponse From(RestaurantSubscriptionPeriod p) =>
        new(p.Id, p.StartsOn, p.EndsOn, p.Years, p.AmountCents, p.PaidOn, p.PaidOn is not null);
}

// One snapshot: the periods shown always belong to the summary version a write must confirm.
public sealed record SubscriptionDetail(SubscriptionSummary Summary, SubscriptionPeriodResponse[] Periods);

public sealed record SubscriptionReminders(int DueSoonCount, int ExpiredCount, int UnpaidCount);
