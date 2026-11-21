using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Platform;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record InitialSubscriptionPeriod(
    Guid Id,
    DateOnly StartsOn,
    int Months,
    long MonthlyFeeCents,
    DateOnly? PaidOn = null,
    [StringLength(500)] string? Reason = null
);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record SubscriptionMetadataInput(
    int ExpectedVersion,
    [StringLength(500)] string? OwnerContact,
    long? DefaultMonthlyFeeCents
);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record SubscriptionPeriodInput(
    int ExpectedVersion,
    Guid Id,
    DateOnly StartsOn,
    int Months,
    long MonthlyFeeCents,
    DateOnly? PaidOn = null,
    [StringLength(500)] string? Reason = null
);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record SubscriptionPeriodEditInput(
    int ExpectedVersion,
    DateOnly StartsOn,
    int Months,
    long MonthlyFeeCents,
    [StringLength(500)] string? Reason = null
);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record SubscriptionPaymentInput(
    int ExpectedVersion,
    DateOnly PaidOn,
    [StringLength(500)] string? Reason = null
);

public sealed record SubscriptionSummary(
    string? OwnerContact,
    long? DefaultMonthlyFeeCents,
    int Version,
    string ServiceState,
    DateOnly? StartsOn,
    DateOnly? ExpiresOn,
    string? PaymentState,
    int UnpaidPeriodCount,
    SubscriptionRenewal? Renewal,
    DateOnly LocalToday
)
{
    public bool DueSoon => Renewal?.Kind == SubscriptionNoticeKind.DueSoon;
    public bool RenewalExpired => Renewal?.Kind == SubscriptionNoticeKind.Expired;
    public bool HasUnpaid => UnpaidPeriodCount > 0 || Renewal is { AwaitingPayment: true };

    // Platform restaurant-list filters.
    public static readonly string[] Filters = ["UNPAID", "DUE_SOON", "EXPIRED", "UNCONFIGURED"];

    public bool Matches(string filter) =>
        filter switch
        {
            "UNPAID" => HasUnpaid,
            "DUE_SOON" => DueSoon,
            "EXPIRED" => RenewalExpired,
            "UNCONFIGURED" => ServiceState == "UNCONFIGURED",
            _ => false,
        };
}

public sealed record SubscriptionPeriodResponse(
    Guid Id,
    DateOnly StartsOn,
    DateOnly EndsOn,
    int Months,
    long MonthlyFeeCents,
    long AmountCents,
    DateOnly? PaidOn,
    bool IsPaid
)
{
    public static SubscriptionPeriodResponse From(RestaurantSubscriptionPeriod p) =>
        new(
            p.Id,
            p.StartsOn,
            p.EndsOn,
            p.Months,
            p.MonthlyFeeCents,
            p.AmountCents,
            p.PaidOn,
            p.PaidOn is not null
        );
}

// One snapshot: the periods shown always belong to the summary version a write must confirm.
public sealed record SubscriptionDetail(
    SubscriptionSummary Summary,
    SubscriptionPeriodResponse[] Periods
);

public sealed record SubscriptionReminders(int DueSoonCount, int ExpiredCount, int UnpaidCount);

public sealed record SubscriptionRenewal(
    Guid PeriodId,
    DateOnly Deadline,
    SubscriptionNoticeKind Kind,
    bool AwaitingPayment,
    bool PeriodPaid
)
{
    [JsonIgnore]
    public SubscriptionNoticeKind Kind { get; init; } = Kind;

    public string Stage => ApiEnum.Text(Kind);
}

public sealed record SubscriptionChange(
    SubscriptionPeriodResponse? Before,
    SubscriptionPeriodResponse After
);

public sealed record SubscriptionNoticeResponse(
    Guid Id,
    Guid RestaurantId,
    string RestaurantName,
    string Kind,
    SubscriptionChange? Change,
    string? Reason,
    DateOnly? Deadline,
    bool AwaitingPayment,
    bool? PeriodPaid
);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record SubscriptionAcknowledgeInput([Required] Guid[] Ids);
