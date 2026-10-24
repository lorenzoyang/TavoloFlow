using System.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Platform;

public sealed class SubscriptionService(ApplicationDbContext db, TimeProvider clock, ILogger<SubscriptionService> logger)
{
    private DateTime Now => clock.GetUtcNow().UtcDateTime;
    public static DateOnly LocalDate(string timeZone, DateTimeOffset now) => DateOnly.FromDateTime(
        TimeZoneInfo.ConvertTime(now, TimeZoneInfo.FindSystemTimeZoneById(timeZone)).DateTime);
    private DateOnly Today(Restaurant r) => LocalDate(r.TimeZone, clock.GetUtcNow());

    // Called by restaurant creation inside its existing transaction, before its single SaveChanges.
    public void Initialize(Restaurant restaurant, string? contact, long? annualFee, InitialSubscriptionPeriod? initial)
    {
        ValidateMetadata(contact, annualFee);
        restaurant.OwnerContact = InputRules.TrimToNull(contact);
        restaurant.DefaultAnnualFeeCents = annualFee;
        if (initial is null) return;
        ValidatePeriod(initial.Id, initial.StartsOn, initial.EndsOn, initial.Years, initial.AmountCents);
        ValidatePaidOn(initial.PaidOn, Today(restaurant));
        db.RestaurantSubscriptionPeriods.Add(new RestaurantSubscriptionPeriod
        {
            Id = initial.Id, RestaurantId = restaurant.Id, StartsOn = initial.StartsOn, EndsOn = initial.EndsOn,
            Years = initial.Years, AmountCents = initial.AmountCents, PaidOn = initial.PaidOn, CreatedAt = Now
        });
    }

    public static SubscriptionSummary Summarize(Restaurant restaurant,
        IEnumerable<RestaurantSubscriptionPeriod> periods, DateOnly today)
    {
        var ordered = periods.OrderBy(p => p.StartsOn).ThenBy(p => p.Id).ToArray();
        // The period in force today; else the latest one already started (now expired); else the first upcoming one.
        var chosen = ordered.FirstOrDefault(p => p.StartsOn <= today && p.EndsOn > today)
            ?? ordered.LastOrDefault(p => p.StartsOn <= today) ?? ordered.FirstOrDefault();
        // Later periods that start exactly at the expiry extend the service; the first gap ends it.
        DateOnly? expiry = chosen?.EndsOn;
        if (chosen is not null)
        {
            foreach (var next in ordered.Where(p => p.StartsOn >= chosen.EndsOn))
            {
                if (next.StartsOn != expiry) break;
                expiry = next.EndsOn;
            }
        }
        var state = chosen is null ? "UNCONFIGURED" : chosen.StartsOn > today ? "UPCOMING" : expiry <= today ? "EXPIRED" : "ACTIVE";
        var paymentState = chosen is null ? null : chosen.PaidOn is null ? "UNPAID" : "PAID";
        // Payment is independent of service: every started period stays due until paid, even after expiry.
        var unpaid = ordered.Count(p => p.PaidOn is null && p.StartsOn <= today);
        var remaining = expiry?.DayNumber - today.DayNumber;
        var dueSoon = remaining is > 0 and <= 7;
        return new(restaurant.OwnerContact, restaurant.DefaultAnnualFeeCents, restaurant.SubscriptionVersion,
            state, chosen?.StartsOn, expiry, paymentState, unpaid, dueSoon, today);
    }

    // The caller owns a repeatable-read snapshot when combining summaries with other data.
    public async Task<Dictionary<Guid, SubscriptionSummary>> SummariesAsync(Restaurant[] restaurants, CancellationToken ct)
    {
        var ids = restaurants.Select(r => r.Id).ToArray();
        var periods = await db.RestaurantSubscriptionPeriods.AsNoTracking().Where(p => ids.Contains(p.RestaurantId)).ToArrayAsync(ct);
        var groups = periods.ToLookup(p => p.RestaurantId);
        var now = clock.GetUtcNow();
        return restaurants.ToDictionary(r => r.Id, r => Summarize(r, groups[r.Id], LocalDate(r.TimeZone, now)));
    }

    public async Task<SubscriptionDetail> ReadAsync(Guid restaurantId, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var restaurant = await db.Restaurants.AsNoTracking().SingleOrDefaultAsync(r => r.Id == restaurantId, ct)
            ?? throw AdministrationErrors.RestaurantNotFound();
        var result = await DetailAsync(restaurant, ct);
        await transaction.CommitAsync(ct);
        return result;
    }

    public async Task<SubscriptionReminders> RemindersAsync(CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var restaurants = await db.Restaurants.AsNoTracking().ToArrayAsync(ct);
        var summaries = (await SummariesAsync(restaurants, ct)).Values;
        var result = new SubscriptionReminders(summaries.Count(s => s.DueSoon), summaries.Count(s => s.ServiceState == "EXPIRED"),
            summaries.Count(s => s.UnpaidPeriodCount > 0));
        await transaction.CommitAsync(ct);
        return result;
    }

    public Task<SubscriptionDetail> UpdateMetadataAsync(Guid restaurantId, SubscriptionMetadataInput input, Guid actor, CancellationToken ct) =>
        RunAsync(restaurantId, input.ExpectedVersion, "METADATA", actor, r =>
        {
            ValidateMetadata(input.OwnerContact, input.DefaultAnnualFeeCents);
            var contact = InputRules.TrimToNull(input.OwnerContact);
            var changed = r.OwnerContact != contact || r.DefaultAnnualFeeCents != input.DefaultAnnualFeeCents;
            r.OwnerContact = contact;
            r.DefaultAnnualFeeCents = input.DefaultAnnualFeeCents;
            return Task.FromResult(changed);
        }, ct);

    public Task<SubscriptionDetail> CreatePeriodAsync(Guid restaurantId, SubscriptionPeriodInput input, Guid actor, CancellationToken ct) =>
        RunAsync(restaurantId, input.ExpectedVersion, "CREATE_PERIOD", actor, async r =>
        {
            ValidatePeriod(input.Id, input.StartsOn, input.EndsOn, input.Years, input.AmountCents);
            ValidatePaidOn(input.PaidOn, Today(r));
            if (await db.RestaurantSubscriptionPeriods.AnyAsync(p => p.Id == input.Id, ct))
                throw PeriodExists();
            await EnsureNoOverlapAsync(restaurantId, input.StartsOn, input.EndsOn, null, ct);
            db.RestaurantSubscriptionPeriods.Add(new RestaurantSubscriptionPeriod { Id = input.Id, RestaurantId = restaurantId,
                StartsOn = input.StartsOn, EndsOn = input.EndsOn, Years = input.Years, AmountCents = input.AmountCents,
                PaidOn = input.PaidOn, CreatedAt = Now });
            return true;
        }, ct);

    public Task<SubscriptionDetail> EditPeriodAsync(Guid restaurantId, Guid periodId, SubscriptionPeriodEditInput input, Guid actor, CancellationToken ct) =>
        RunAsync(restaurantId, input.ExpectedVersion, "EDIT_PERIOD", actor, async _ =>
        {
            var p = await PeriodAsync(restaurantId, periodId, ct);
            if (p.PaidOn is not null) throw new ApiException(409, "SUBSCRIPTION_PERIOD_PAID", "已收款周期的约定金额和收款信息已冻结；如需延期请单独调整期限。");
            ValidatePeriod(p.Id, input.StartsOn, input.EndsOn, input.Years, input.AmountCents);
            await EnsureNoOverlapAsync(restaurantId, input.StartsOn, input.EndsOn, p.Id, ct);
            var changed = p.StartsOn != input.StartsOn || p.EndsOn != input.EndsOn || p.Years != input.Years || p.AmountCents != input.AmountCents;
            p.StartsOn = input.StartsOn; p.EndsOn = input.EndsOn; p.Years = input.Years; p.AmountCents = input.AmountCents;
            return changed;
        }, ct);

    // The only change a paid period accepts: its frozen amount and payment date stay as collected.
    public Task<SubscriptionDetail> ChangeExpiryAsync(Guid restaurantId, Guid periodId, SubscriptionExpiryInput input, Guid actor, CancellationToken ct) =>
        RunAsync(restaurantId, input.ExpectedVersion, "EXPIRY", actor, async _ =>
        {
            var p = await PeriodAsync(restaurantId, periodId, ct);
            ValidatePeriod(p.Id, p.StartsOn, input.EndsOn, p.Years, p.AmountCents);
            await EnsureNoOverlapAsync(restaurantId, p.StartsOn, input.EndsOn, p.Id, ct);
            var changed = p.EndsOn != input.EndsOn;
            p.EndsOn = input.EndsOn;
            return changed;
        }, ct);

    public Task<SubscriptionDetail> ConfirmPaymentAsync(Guid restaurantId, Guid periodId, SubscriptionPaymentInput input, Guid actor, CancellationToken ct) =>
        RunAsync(restaurantId, input.ExpectedVersion, "PAYMENT", actor, async r =>
        {
            var p = await PeriodAsync(restaurantId, periodId, ct);
            ValidatePaidOn(input.PaidOn, Today(r));
            if (p.PaidOn is not null) throw new ApiException(409, "SUBSCRIPTION_PERIOD_PAID", "此周期已登记全额收款，请核对原记录。");
            p.PaidOn = input.PaidOn;
            return true;
        }, ct);

    // Every write confirms the subscription version the administrator read, and that version is the only
    // duplicate guard: a lost, repeated or late request applies only to the exact state it was confirmed
    // against, so at most one write per version succeeds and every other one receives SUBSCRIPTION_CHANGED.
    private async Task<SubscriptionDetail> RunAsync(Guid restaurantId, int expectedVersion, string action, Guid actor,
        Func<Restaurant, Task<bool>> apply, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var restaurant = await RowLocks.RestaurantAsync(db, restaurantId, RowLock.Update, ct)
            ?? throw AdministrationErrors.RestaurantNotFound();
        if (expectedVersion != restaurant.SubscriptionVersion || expectedVersion == int.MaxValue)
            throw new ApiException(409, "SUBSCRIPTION_CHANGED", "年费资料已变化（可能是本次或其他操作已生效），请核对最新资料后再确认。");
        var changed = await apply(restaurant);
        if (changed)
        {
            restaurant.SubscriptionVersion++;
            await db.Restaurants.Where(r => r.Id == restaurantId).ExecuteUpdateAsync(u => u
                .SetProperty(r => r.OwnerContact, restaurant.OwnerContact)
                .SetProperty(r => r.DefaultAnnualFeeCents, restaurant.DefaultAnnualFeeCents)
                .SetProperty(r => r.SubscriptionVersion, restaurant.SubscriptionVersion), ct);
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException error) when (error.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
            {
                throw PeriodExists();
            }
        }
        var result = await DetailAsync(restaurant, ct);
        await transaction.CommitAsync(ct);
        if (changed) logger.LogInformation("Platform {ActorId} changed restaurant {RestaurantId} subscription ({Action}).", actor, restaurantId, action);
        return result;
    }

    // Latest start first: periods never overlap, so the first one is also the latest agreement.
    private async Task<SubscriptionDetail> DetailAsync(Restaurant restaurant, CancellationToken ct)
    {
        var periods = await db.RestaurantSubscriptionPeriods.AsNoTracking().Where(p => p.RestaurantId == restaurant.Id)
            .OrderByDescending(p => p.StartsOn).ThenByDescending(p => p.Id).ToArrayAsync(ct);
        return new(Summarize(restaurant, periods, Today(restaurant)), periods.Select(SubscriptionPeriodResponse.From).ToArray());
    }

    private async Task<RestaurantSubscriptionPeriod> PeriodAsync(Guid restaurantId, Guid id, CancellationToken ct) =>
        await db.RestaurantSubscriptionPeriods.SingleOrDefaultAsync(p => p.RestaurantId == restaurantId && p.Id == id, ct)
            ?? throw new ApiException(404, "SUBSCRIPTION_PERIOD_NOT_FOUND", "收费周期不存在或不属于此餐厅。");
    private static ApiException PeriodExists() =>
        new(409, "SUBSCRIPTION_PERIOD_EXISTS", "此收费周期编号已使用，请核对原记录。");
    private async Task EnsureNoOverlapAsync(Guid restaurantId, DateOnly starts, DateOnly ends, Guid? exceptId, CancellationToken ct)
    {
        if (await db.RestaurantSubscriptionPeriods.AnyAsync(p => p.RestaurantId == restaurantId && p.Id != exceptId && p.StartsOn < ends && p.EndsOn > starts, ct))
            throw new ApiException(409, "SUBSCRIPTION_PERIOD_OVERLAP", "收费周期不能重叠，请核对开始和截止日期。");
    }
    private static void ValidateMetadata(string? contact, long? annualFee)
    {
        if (contact?.Length > 500 || annualFee is < 0 or > InputRules.MaxSafeCents)
            throw ApiException.Validation("联系方式最多 500 字，年费须为有效的非负金额。");
    }
    private static void ValidatePeriod(Guid id, DateOnly starts, DateOnly ends, int years, long amount)
    {
        if (id == Guid.Empty || starts == DateOnly.MinValue || ends <= starts || years is < 1 or > 9998 ||
            starts.Year + years > 9999 || amount is < 1 or > InputRules.MaxSafeCents)
            throw ApiException.Validation("请填写有效的收费周期、正整数年数和正数总金额。");
    }
    private static void ValidatePaidOn(DateOnly? paidOn, DateOnly today)
    {
        if (paidOn == DateOnly.MinValue || paidOn > today)
            throw ApiException.Validation("付费日期须为有效日期，且不能晚于餐厅当地今天。");
    }
}
