using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Guests;

namespace TavoloFlow.Api.Ordering;

public sealed class OrderService(ApplicationDbContext db, TimeProvider clock)
{
    private const long MaxCents = InputRules.MaxSafeCents;
    private const int MaxOptionsPerLine = 50;

    public async Task<OrderCreation> CreateAsync(
        GuestIdentity guest,
        CreateOrderInput input,
        CancellationToken ct
    )
    {
        if (
            input.SessionId is null
            || input.SessionId == Guid.Empty
            || input.ClientRequestId is null
            || input.ClientRequestId == Guid.Empty
        )
            throw OrderErrors.Invalid("sessionId", "Provide a valid visit ID and request ID.");
        RequireTarget(guest, input.SessionId.Value);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        // Menu writers and item deletion take restaurant UPDATE, so these SHARE locks keep prices and snapshots
        // stable without serializing orders from different tables.
        var (restaurant, table) = await DiningEntrance.LockAsync(
            db,
            guest.RestaurantId,
            guest.TableId,
            ct
        );
        var session = await LockSessionAsync(guest, RowLock.Update, ct);
        var original = await Orders(guest)
            .SingleOrDefaultAsync(o => o.ClientRequestId == input.ClientRequestId, ct);
        if (original is not null)
        {
            await transaction.CommitAsync(ct);
            return new(OrderResponse.From(original), false);
        }

        DiningEntrance.Require(restaurant, table);
        if (!restaurant.OrderingEnabled)
            throw new ApiException(
                409,
                "ORDERING_PAUSED",
                "The restaurant isn't accepting QR orders right now."
            );
        var lines = Validate(input);
        var ids = lines.Select(x => x.MenuItemId).Distinct().ToArray();
        var menu = await db
            .MenuItems.AsNoTracking()
            .Where(x => x.RestaurantId == guest.RestaurantId && ids.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);
        var groups = await GroupsAsync(guest.RestaurantId, ids, ct);
        var changes = new List<MenuChange>();
        var choices = new OrderOptions.Choice?[lines.Length];
        foreach (var (line, index) in lines.Select((line, index) => (line, index)))
        {
            if (!menu.TryGetValue(line.MenuItemId, out var item))
                changes.Add(new(line.MenuItemId, "MISSING", null, null));
            else if (!item.IsAvailable || !item.AllergenReviewed)
                changes.Add(new(item.Id, "UNAVAILABLE", item.PriceCents, false));
            else if (
                OrderOptions.Resolve(item, groups.GetValueOrDefault(item.Id, []), line.OptionIds!)
                is not { } choice
            )
                changes.Add(new(item.Id, "OPTIONS_CHANGED", null, true));
            else if (choice.UnitPriceCents != line.ExpectedUnitPriceCents)
                changes.Add(new(item.Id, "PRICE_CHANGED", choice.UnitPriceCents, true));
            else
                choices[index] = choice;
        }
        if (changes.Count > 0)
            throw OrderErrors.MenuChanged(changes.Distinct().ToArray());

        long total = 0;
        foreach (var (line, index) in lines.Select((line, index) => (line, index)))
        {
            var price = choices[index]!.UnitPriceCents;
            if (
                price <= 0
                || price > MaxCents / line.Quantity
                || total > MaxCents - price * line.Quantity
            )
                throw OrderErrors.Invalid(
                    "items",
                    "The order total exceeds the safe integer range."
                );
            total += price * line.Quantity;
        }
        var existingTotal = await db
            .Orders.Where(o =>
                o.RestaurantId == guest.RestaurantId && o.DiningSessionId == guest.SessionId
            )
            .SelectMany(o => o.Items)
            .Where(i => i.Status != OrderItemStatus.Cancelled)
            .SumAsync(i => i.UnitPriceCents * i.Quantity, ct);
        if (existingTotal > MaxCents - total || session.BillVersion == int.MaxValue)
            throw new ApiException(
                409,
                "BILL_LIMIT_REACHED",
                "The bill has reached the supported limit. Ask the staff."
            );

        var order = new Order
        {
            Id = Guid.CreateVersion7(),
            RestaurantId = guest.RestaurantId,
            DiningSessionId = guest.SessionId,
            ClientRequestId = input.ClientRequestId.Value,
            TotalAmountCents = total,
            DefaultLanguageSnapshot = restaurant.DefaultLanguage,
            CreatedAt = clock.GetUtcNow().UtcDateTime,
        };
        foreach (var (line, index) in lines.Select((line, index) => (line, index)))
        {
            var item = menu[line.MenuItemId];
            var choice = choices[index]!;
            order.Items.Add(
                new OrderItem
                {
                    Id = Guid.CreateVersion7(),
                    RestaurantId = guest.RestaurantId,
                    MenuItemId = item.Id,
                    ItemCodeSnapshot = item.ItemCode,
                    NameZhSnapshot = item.NameZh,
                    NameItSnapshot = item.NameIt,
                    NameEnSnapshot = item.NameEn,
                    AllergenCodesSnapshot = choice.AllergenCodes,
                    UnitPriceCents = choice.UnitPriceCents,
                    Quantity = line.Quantity,
                    Remark = InputRules.TrimToNull(line.Remark),
                    OptionsSnapshot = choice.Snapshot,
                }
            );
        }
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);
        await db
            .DiningSessions.Where(s => s.Id == session.Id && s.RestaurantId == guest.RestaurantId)
            .ExecuteUpdateAsync(u => u.SetProperty(s => s.BillVersion, s => s.BillVersion + 1), ct);
        // Read PostgreSQL's timestamp precision, so pagination cursors and retry responses agree exactly.
        var saved = await Orders(guest).SingleAsync(o => o.Id == order.Id, ct);
        await transaction.CommitAsync(ct);
        return new(OrderResponse.From(saved), true);
    }

    public async Task<OrderResponse> ByRequestAsync(
        GuestIdentity guest,
        Guid sessionId,
        Guid requestId,
        CancellationToken ct
    )
    {
        RequireTarget(guest, sessionId);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await LockSessionAsync(guest, RowLock.Share, ct);
        var order =
            await Orders(guest).SingleOrDefaultAsync(o => o.ClientRequestId == requestId, ct)
            ?? throw new ApiException(
                404,
                "ORDER_NOT_FOUND",
                "This submission hasn't been found yet. Keep checking, or retry with the original request."
            );
        var result = OrderResponse.From(order);
        await transaction.CommitAsync(ct);
        return result;
    }

    public async Task<OrderPage> ListAsync(
        GuestIdentity guest,
        Guid sessionId,
        string? cursor,
        int limit,
        CancellationToken ct
    )
    {
        RequireTarget(guest, sessionId);
        Paging.EnsureLimit(limit);
        var after = Paging.Decode<OrderCursor>(
            cursor,
            c => c.SessionId == sessionId && Paging.IsPosition(c.CreatedAt, c.Id)
        );
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await LockSessionAsync(guest, RowLock.Share, ct);
        var query = Orders(guest);
        if (after is not null)
            query = query.Where(o =>
                EF.Functions.LessThan(
                    ValueTuple.Create(o.CreatedAt, o.Id),
                    ValueTuple.Create(after.CreatedAt, after.Id)
                )
            );
        var rows = await query
            .OrderByDescending(o => o.CreatedAt)
            .ThenByDescending(o => o.Id)
            .Take(limit + 1)
            .ToArrayAsync(ct);
        var (page, next) = Paging.Page(
            rows,
            limit,
            last => new OrderCursor(sessionId, last.CreatedAt, last.Id)
        );
        var total = await db
            .Orders.Where(o =>
                o.RestaurantId == guest.RestaurantId && o.DiningSessionId == sessionId
            )
            .SelectMany(o => o.Items)
            .Where(i => i.Status != OrderItemStatus.Cancelled)
            .SumAsync(i => i.UnitPriceCents * i.Quantity, ct);
        await transaction.CommitAsync(ct);
        return new(page.Select(OrderResponse.From).ToArray(), next, total);
    }

    // Each ordered dish's option groups, in the restaurant-wide order. Covered by the restaurant SHARE lock,
    // like the dishes themselves; a restaurant without options pays for a single empty query.
    private async Task<Dictionary<Guid, MenuOptionGroup[]>> GroupsAsync(
        Guid restaurantId,
        Guid[] itemIds,
        CancellationToken ct
    )
    {
        var links = await db
            .MenuItemOptionGroups.AsNoTracking()
            .Where(x => x.RestaurantId == restaurantId && itemIds.Contains(x.MenuItemId))
            .ToArrayAsync(ct);
        if (links.Length == 0)
            return [];
        var groupIds = links.Select(x => x.GroupId).Distinct().ToArray();
        var groups = await db
            .MenuOptionGroups.AsNoTracking()
            .Include(x => x.Options)
            .Where(x => x.RestaurantId == restaurantId && groupIds.Contains(x.Id))
            .OrderBy(x => x.Position)
            .ThenBy(x => x.Id)
            .ToArrayAsync(ct);
        var rank = groups.Select((group, index) => (group.Id, index)).ToDictionary();
        var byId = groups.ToDictionary(x => x.Id);
        return links
            .GroupBy(x => x.MenuItemId)
            .ToDictionary(
                x => x.Key,
                x => x.Select(link => byId[link.GroupId]).OrderBy(g => rank[g.Id]).ToArray()
            );
    }

    private IQueryable<Order> Orders(GuestIdentity guest) =>
        db
            .Orders.AsNoTracking()
            .Include(o => o.Items)
            .Where(o =>
                o.RestaurantId == guest.RestaurantId && o.DiningSessionId == guest.SessionId
            );

    private async Task<DiningSession> LockSessionAsync(
        GuestIdentity guest,
        RowLock mode,
        CancellationToken ct
    )
    {
        // Reading needs only the session lock: no later restaurant/table locks are acquired.
        var session =
            await RowLocks.SessionAsync(db, guest.RestaurantId, guest.SessionId, mode, ct)
            ?? throw DiningErrors.SessionNotFound();
        if (session.Status != DiningSessionStatus.Active)
            throw DiningErrors.SessionClosed();
        if (session.TableId != guest.TableId)
            throw GuestErrors.SessionMismatch();
        return session;
    }

    private static void RequireTarget(GuestIdentity guest, Guid target)
    {
        if (guest.SessionId != target)
            throw GuestErrors.SessionMismatch();
    }

    private static OrderLineInput[] Validate(CreateOrderInput input)
    {
        if (
            input.Items is null
            || input.Items.Length is < 1 or > 30
            || input.Items.Any(x => x is null)
        )
            throw OrderErrors.Invalid("items", "An order must have 1–30 lines.");
        var lines = input.Items.Select(x => x!).ToArray();
        foreach (var (line, index) in lines.Select((line, index) => (line, index)))
        {
            if (
                line.MenuItemId == Guid.Empty
                || line.Quantity is < 1 or > 20
                || line.ExpectedUnitPriceCents < 1
                || line.ExpectedUnitPriceCents > MaxCents
                || line.Remark?.Length > 200
                || line.OptionIds is null
                || line.OptionIds.Length > MaxOptionsPerLine
                || line.OptionIds.Contains(Guid.Empty)
                || line.OptionIds.Distinct().Count() < line.OptionIds.Length
            )
                throw OrderErrors.Invalid(
                    $"items[{index}]",
                    "Each line needs a valid dish, 1–20 portions, a remark of at most 200 characters, a list of at most 50 distinct options (empty for none) and a confirmed price in positive whole euro cents."
                );
        }
        if (lines.Sum(x => x.Quantity) > 100)
            throw OrderErrors.Invalid("items", "An order can have at most 100 portions.");
        return lines;
    }

    private sealed record OrderCursor(Guid SessionId, DateTime CreatedAt, Guid Id);
}
