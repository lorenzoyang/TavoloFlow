using System.Data;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Platform;

public sealed class SubscriptionService(
    ApplicationDbContext db,
    TimeProvider clock,
    ILogger<SubscriptionService> logger
)
{
    private DateTime Now => clock.GetUtcNow().UtcDateTime;

    public static DateOnly LocalDate(string timeZone, DateTimeOffset now) =>
        DateOnly.FromDateTime(
            TimeZoneInfo.ConvertTime(now, TimeZoneInfo.FindSystemTimeZoneById(timeZone)).DateTime
        );

    private DateOnly Today(Restaurant r) => LocalDate(r.TimeZone, clock.GetUtcNow());

    // Called by restaurant creation inside its existing transaction, before its single SaveChanges.
    public void Initialize(
        Restaurant restaurant,
        string? contact,
        long? monthlyFee,
        InitialSubscriptionPeriod? initial
    )
    {
        ValidateMetadata(contact, monthlyFee);
        restaurant.OwnerContact = InputRules.TrimToNull(contact);
        restaurant.DefaultMonthlyFeeCents = monthlyFee;
        if (initial is null)
            return;
        var period = BuildPeriod(
            restaurant,
            initial.Id,
            initial.StartsOn,
            initial.Months,
            initial.MonthlyFeeCents,
            initial.PaidOn
        );
        db.RestaurantSubscriptionPeriods.Add(period);
        RecordNotice(period, SubscriptionNoticeKind.Registered, initial.Reason);
    }

    private RestaurantSubscriptionPeriod BuildPeriod(
        Restaurant restaurant,
        Guid id,
        DateOnly startsOn,
        int months,
        long monthlyFee,
        DateOnly? paidOn
    )
    {
        var (endsOn, amount) = CalculatePeriod(id, startsOn, months, monthlyFee);
        ValidatePaidOn(paidOn, Today(restaurant));
        return new()
        {
            Id = id,
            RestaurantId = restaurant.Id,
            StartsOn = startsOn,
            EndsOn = endsOn,
            Months = months,
            MonthlyFeeCents = monthlyFee,
            AmountCents = amount,
            PaidOn = paidOn,
            CreatedAt = Now,
        };
    }

    private void RecordNotice(
        RestaurantSubscriptionPeriod period,
        SubscriptionNoticeKind kind,
        string? reason,
        SubscriptionPeriodResponse? before = null
    ) =>
        db.SubscriptionNotices.Add(
            new()
            {
                Id = Guid.NewGuid(),
                RestaurantId = period.RestaurantId,
                PeriodId = period.Id,
                Kind = kind,
                CreatedAt = Now,
                Reason = InputRules.TrimToNull(reason),
                Change = JsonSerializer.Serialize(
                    new SubscriptionChange(before, SubscriptionPeriodResponse.From(period))
                ),
            }
        );

    public static SubscriptionSummary Summarize(
        Restaurant restaurant,
        IEnumerable<RestaurantSubscriptionPeriod> periods,
        DateOnly today
    )
    {
        var ordered = periods.OrderBy(p => p.StartsOn).ThenBy(p => p.Id).ToArray();
        // The period in force today; else the latest one already started (now expired); else the first upcoming one.
        var chosen =
            ordered.FirstOrDefault(p => p.StartsOn <= today && p.EndsOn > today)
            ?? ordered.LastOrDefault(p => p.StartsOn <= today)
            ?? ordered.FirstOrDefault();
        // Later periods that start exactly at the expiry extend the service; the first gap ends it.
        DateOnly? expiry = chosen?.EndsOn;
        if (chosen is not null)
        {
            foreach (var next in ordered.Where(p => p.StartsOn >= chosen.EndsOn))
            {
                if (next.StartsOn != expiry)
                    break;
                expiry = next.EndsOn;
            }
        }
        var state =
            chosen is null ? "UNCONFIGURED"
            : chosen.StartsOn > today ? "UPCOMING"
            : expiry <= today ? "EXPIRED"
            : "ACTIVE";
        var paymentState =
            chosen is null ? null
            : chosen.PaidOn is null ? "UNPAID"
            : "PAID";
        // Payment is independent of service: every started period stays due until paid, even after expiry.
        var unpaid = ordered.Count(p => p.PaidOn is null && p.StartsOn <= today);
        return new(
            restaurant.OwnerContact,
            restaurant.DefaultMonthlyFeeCents,
            restaurant.SubscriptionVersion,
            state,
            chosen?.StartsOn,
            expiry,
            paymentState,
            unpaid,
            Renewal(ordered, today),
            today
        );
    }

    // A registered but unpaid successor leaves the original renewal deadline outstanding.
    private static SubscriptionRenewal? Renewal(
        RestaurantSubscriptionPeriod[] ordered,
        DateOnly today
    )
    {
        var latestPaidStart = ordered
            .LastOrDefault(p => p.StartsOn <= today && p.PaidOn is not null)
            ?.StartsOn;
        for (var index = ordered.Length - 1; index >= 0; index--)
        {
            var period = ordered[index];
            var remaining = period.EndsOn.DayNumber - today.DayNumber;
            if (period.StartsOn > today || remaining > 7 || period.EndsOn <= latestPaidStart)
                continue;

            var next = index + 1 < ordered.Length ? ordered[index + 1] : null;
            var touching = next?.StartsOn == period.EndsOn;
            if (touching && next!.PaidOn is not null)
                continue;

            return new(
                period.Id,
                period.EndsOn,
                remaining > 0 ? SubscriptionNoticeKind.DueSoon : SubscriptionNoticeKind.Expired,
                touching,
                period.PaidOn is not null
            );
        }
        return null;
    }

    // The caller owns a repeatable-read snapshot when combining summaries with other data.
    public async Task<Dictionary<Guid, SubscriptionSummary>> SummariesAsync(
        Restaurant[] restaurants,
        CancellationToken ct
    )
    {
        if (restaurants.Length == 0)
            return [];
        var ids = restaurants.Select(r => r.Id).ToArray();
        var periods = await db
            .RestaurantSubscriptionPeriods.AsNoTracking()
            .Where(p => ids.Contains(p.RestaurantId))
            .ToArrayAsync(ct);
        var groups = periods.ToLookup(p => p.RestaurantId);
        var now = clock.GetUtcNow();
        return restaurants.ToDictionary(
            r => r.Id,
            r => Summarize(r, groups[r.Id], LocalDate(r.TimeZone, now))
        );
    }

    public async Task<SubscriptionDetail> ReadAsync(Guid restaurantId, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.RepeatableRead,
            ct
        );
        var restaurant =
            await db.Restaurants.AsNoTracking().SingleOrDefaultAsync(r => r.Id == restaurantId, ct)
            ?? throw AdministrationErrors.RestaurantNotFound();
        var result = await DetailAsync(restaurant, ct);
        await transaction.CommitAsync(ct);
        return result;
    }

    public async Task<SubscriptionReminders> RemindersAsync(CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.RepeatableRead,
            ct
        );
        var restaurants = await db.Restaurants.AsNoTracking().ToArrayAsync(ct);
        var summaries = (await SummariesAsync(restaurants, ct)).Values;
        var result = new SubscriptionReminders(
            summaries.Count(s => s.DueSoon),
            summaries.Count(s => s.RenewalExpired),
            summaries.Count(s => s.HasUnpaid)
        );
        await transaction.CommitAsync(ct);
        return result;
    }

    public Task<SubscriptionDetail> UpdateMetadataAsync(
        Guid restaurantId,
        SubscriptionMetadataInput input,
        Guid actor,
        CancellationToken ct
    ) =>
        RunAsync(
            restaurantId,
            input.ExpectedVersion,
            "METADATA",
            actor,
            r =>
            {
                ValidateMetadata(input.OwnerContact, input.DefaultMonthlyFeeCents);
                var contact = InputRules.TrimToNull(input.OwnerContact);
                var changed =
                    r.OwnerContact != contact
                    || r.DefaultMonthlyFeeCents != input.DefaultMonthlyFeeCents;
                r.OwnerContact = contact;
                r.DefaultMonthlyFeeCents = input.DefaultMonthlyFeeCents;
                return Task.FromResult(changed);
            },
            ct
        );

    public Task<SubscriptionDetail> CreatePeriodAsync(
        Guid restaurantId,
        SubscriptionPeriodInput input,
        Guid actor,
        CancellationToken ct
    ) =>
        RunAsync(
            restaurantId,
            input.ExpectedVersion,
            "CREATE_PERIOD",
            actor,
            async r =>
            {
                var period = BuildPeriod(
                    r,
                    input.Id,
                    input.StartsOn,
                    input.Months,
                    input.MonthlyFeeCents,
                    input.PaidOn
                );
                if (await db.RestaurantSubscriptionPeriods.AnyAsync(p => p.Id == input.Id, ct))
                    throw PeriodExists();
                await EnsureNoOverlapAsync(restaurantId, period.StartsOn, period.EndsOn, null, ct);
                db.RestaurantSubscriptionPeriods.Add(period);
                RecordNotice(period, SubscriptionNoticeKind.Registered, input.Reason);
                return true;
            },
            ct
        );

    public Task<SubscriptionDetail> EditPeriodAsync(
        Guid restaurantId,
        Guid periodId,
        SubscriptionPeriodEditInput input,
        Guid actor,
        CancellationToken ct
    ) =>
        RunAsync(
            restaurantId,
            input.ExpectedVersion,
            "EDIT_PERIOD",
            actor,
            async r =>
            {
                var p = await PeriodAsync(restaurantId, periodId, ct);
                if (p.PaidOn is not null)
                    throw new ApiException(
                        409,
                        "SUBSCRIPTION_PERIOD_PAID",
                        "A paid period is a permanent record."
                    );
                var (endsOn, amount) = CalculatePeriod(
                    p.Id,
                    input.StartsOn,
                    input.Months,
                    input.MonthlyFeeCents
                );
                if (
                    p.StartsOn == input.StartsOn
                    && p.Months == input.Months
                    && p.MonthlyFeeCents == input.MonthlyFeeCents
                )
                    return false;
                if (p.StartsOn <= Today(r) && string.IsNullOrWhiteSpace(input.Reason))
                    throw new ApiException(
                        400,
                        "SUBSCRIPTION_REASON_REQUIRED",
                        "Explain changes to a period that has started."
                    );
                await EnsureNoOverlapAsync(restaurantId, input.StartsOn, endsOn, p.Id, ct);

                var before = SubscriptionPeriodResponse.From(p);
                p.StartsOn = input.StartsOn;
                p.EndsOn = endsOn;
                p.Months = input.Months;
                p.MonthlyFeeCents = input.MonthlyFeeCents;
                p.AmountCents = amount;
                RecordNotice(p, SubscriptionNoticeKind.Changed, input.Reason, before);
                return true;
            },
            ct
        );

    public Task<SubscriptionDetail> ConfirmPaymentAsync(
        Guid restaurantId,
        Guid periodId,
        SubscriptionPaymentInput input,
        Guid actor,
        CancellationToken ct
    ) =>
        RunAsync(
            restaurantId,
            input.ExpectedVersion,
            "PAYMENT",
            actor,
            async r =>
            {
                var p = await PeriodAsync(restaurantId, periodId, ct);
                ValidatePaidOn(input.PaidOn, Today(r));
                if (p.PaidOn is not null)
                    throw new ApiException(
                        409,
                        "SUBSCRIPTION_PERIOD_PAID",
                        "This period is already fully paid. Check the original record."
                    );
                p.PaidOn = input.PaidOn;
                RecordNotice(p, SubscriptionNoticeKind.Paid, input.Reason);
                return true;
            },
            ct
        );

    // Every write confirms the subscription version the administrator read, and that version is the only
    // duplicate guard: a lost, repeated or late request applies only to the exact state it was confirmed
    // against, so at most one write per version succeeds and every other one receives SUBSCRIPTION_CHANGED.
    private async Task<SubscriptionDetail> RunAsync(
        Guid restaurantId,
        int expectedVersion,
        string action,
        Guid actor,
        Func<Restaurant, Task<bool>> apply,
        CancellationToken ct
    )
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var restaurant =
            await RowLocks.RestaurantAsync(db, restaurantId, RowLock.Update, ct)
            ?? throw AdministrationErrors.RestaurantNotFound();
        if (expectedVersion != restaurant.SubscriptionVersion || expectedVersion == int.MaxValue)
            throw new ApiException(
                409,
                "SUBSCRIPTION_CHANGED",
                "The subscription has changed (perhaps by this or another action). Check the latest data and confirm again."
            );
        var changed = await apply(restaurant);
        if (changed)
        {
            restaurant.SubscriptionVersion++;
            await db
                .Restaurants.Where(r => r.Id == restaurantId)
                .ExecuteUpdateAsync(
                    u =>
                        u.SetProperty(r => r.OwnerContact, restaurant.OwnerContact)
                            .SetProperty(
                                r => r.DefaultMonthlyFeeCents,
                                restaurant.DefaultMonthlyFeeCents
                            )
                            .SetProperty(
                                r => r.SubscriptionVersion,
                                restaurant.SubscriptionVersion
                            ),
                    ct
                );
            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException error)
                when (error.InnerException
                        is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation }
                )
            {
                throw PeriodExists();
            }
        }
        var result = await DetailAsync(restaurant, ct);
        await transaction.CommitAsync(ct);
        if (changed)
            logger.LogInformation(
                "Platform {ActorId} changed restaurant {RestaurantId} subscription ({Action}).",
                actor,
                restaurantId,
                action
            );
        return result;
    }

    // Latest start first: periods never overlap, so the first one is also the latest agreement.
    private async Task<SubscriptionDetail> DetailAsync(Restaurant restaurant, CancellationToken ct)
    {
        var periods = await db
            .RestaurantSubscriptionPeriods.AsNoTracking()
            .Where(p => p.RestaurantId == restaurant.Id)
            .OrderByDescending(p => p.StartsOn)
            .ThenByDescending(p => p.Id)
            .ToArrayAsync(ct);
        return new(
            Summarize(restaurant, periods, Today(restaurant)),
            periods.Select(SubscriptionPeriodResponse.From).ToArray()
        );
    }

    private async Task<RestaurantSubscriptionPeriod> PeriodAsync(
        Guid restaurantId,
        Guid id,
        CancellationToken ct
    ) =>
        await db.RestaurantSubscriptionPeriods.SingleOrDefaultAsync(
            p => p.RestaurantId == restaurantId && p.Id == id,
            ct
        )
        ?? throw new ApiException(
            404,
            "SUBSCRIPTION_PERIOD_NOT_FOUND",
            "The period doesn't exist or doesn't belong to this restaurant."
        );

    private static ApiException PeriodExists() =>
        new(
            409,
            "SUBSCRIPTION_PERIOD_EXISTS",
            "This period ID is already used. Check the original period."
        );

    private async Task EnsureNoOverlapAsync(
        Guid restaurantId,
        DateOnly starts,
        DateOnly ends,
        Guid? exceptId,
        CancellationToken ct
    )
    {
        if (
            await db.RestaurantSubscriptionPeriods.AnyAsync(
                p =>
                    p.RestaurantId == restaurantId
                    && p.Id != exceptId
                    && p.StartsOn < ends
                    && p.EndsOn > starts,
                ct
            )
        )
            throw new ApiException(
                409,
                "SUBSCRIPTION_PERIOD_OVERLAP",
                "Periods can't overlap. Check the start and end dates."
            );
    }

    private static void ValidateMetadata(string? contact, long? monthlyFee)
    {
        if (contact?.Length > 500 || monthlyFee is < 1 or > InputRules.MaxSafeCents)
            throw ApiException.Validation(
                "The owner contact can be at most 500 characters and the monthly fee must be a positive amount when set."
            );
    }

    private static (DateOnly End, long Amount) CalculatePeriod(
        Guid id,
        DateOnly starts,
        int months,
        long monthlyFee
    )
    {
        var availableMonths = (9999 - starts.Year) * 12 + 12 - starts.Month;
        if (
            id == Guid.Empty
            || starts == DateOnly.MinValue
            || months < 1
            || months > availableMonths
            || monthlyFee < 1
            || monthlyFee > InputRules.MaxSafeCents / months
        )
            throw ApiException.Validation(
                "Enter a valid start date, a positive number of calendar months and a positive monthly fee with a valid total."
            );
        return (starts.AddMonths(months), monthlyFee * months);
    }

    private static void ValidatePaidOn(DateOnly? paidOn, DateOnly today)
    {
        if (paidOn == DateOnly.MinValue || paidOn > today)
            throw ApiException.Validation(
                "The payment date must be a valid date no later than the restaurant's local today."
            );
    }
}
