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

    public async Task<OrderCreation> CreateAsync(GuestIdentity guest, CreateOrderInput input, CancellationToken ct)
    {
        if (input.SessionId is null || input.SessionId == Guid.Empty || input.ClientRequestId is null || input.ClientRequestId == Guid.Empty)
            throw OrderErrors.Invalid("sessionId", "请提供有效的用餐和请求标识。");
        RequireTarget(guest, input.SessionId.Value);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        
        // Menu writers and item deletion take restaurant UPDATE, so these SHARE locks keep prices and snapshots
        // stable without serializing orders from different tables.
        var (restaurant, table) = await DiningEntrance.LockAsync(db, guest.RestaurantId, guest.TableId, ct);
        var session = await LockSessionAsync(guest, RowLock.Update, ct);
        var original = await Orders(guest).SingleOrDefaultAsync(o => o.ClientRequestId == input.ClientRequestId, ct);
        if (original is not null)
        {
            await transaction.CommitAsync(ct);
            return new(OrderResponse.From(original), false);
        }

        DiningEntrance.Require(restaurant, table);
        if (!restaurant.OrderingEnabled)
            throw new ApiException(409, "ORDERING_PAUSED", "餐厅暂未接受扫码订单。");
        var lines = Validate(input);
        var ids = lines.Select(x => x.MenuItemId).Distinct().ToArray();
        var menu = await db.MenuItems.AsNoTracking().Where(x => x.RestaurantId == guest.RestaurantId && ids.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);
        var changes = new List<MenuChange>();
        foreach (var line in lines)
        {
            if (!menu.TryGetValue(line.MenuItemId, out var item)) changes.Add(new(line.MenuItemId, "MISSING", null, null));
            else if (!item.IsAvailable || !item.AllergenReviewed) changes.Add(new(item.Id, "UNAVAILABLE", item.PriceCents, false));
            else if (item.PriceCents != line.ExpectedUnitPriceCents) changes.Add(new(item.Id, "PRICE_CHANGED", item.PriceCents, true));
        }
        if (changes.Count > 0)
            throw OrderErrors.MenuChanged(changes.Distinct().ToArray());

        long total = 0;
        foreach (var line in lines)
        {
            var price = menu[line.MenuItemId].PriceCents;
            if (price <= 0 || price > MaxCents / line.Quantity || total > MaxCents - price * line.Quantity)
                throw OrderErrors.Invalid("items", "订单金额超出安全整数范围。");
            total += price * line.Quantity;
        }
        var existingTotal = await db.Orders.Where(o => o.RestaurantId == guest.RestaurantId &&
            o.DiningSessionId == guest.SessionId).SelectMany(o => o.Items)
            .Where(i => i.Status != OrderItemStatus.Cancelled).SumAsync(i => i.UnitPriceCents * i.Quantity, ct);
        if (existingTotal > MaxCents - total || session.BillVersion == int.MaxValue)
            throw new ApiException(409, "BILL_LIMIT_REACHED", "本轮账单已达到支持的上限，请联系工作人员。");

        var order = new Order
        {
            Id = Guid.CreateVersion7(), RestaurantId = guest.RestaurantId, DiningSessionId = guest.SessionId,
            ClientRequestId = input.ClientRequestId.Value, TotalAmountCents = total,
            DefaultLanguageSnapshot = restaurant.DefaultLanguage, CreatedAt = clock.GetUtcNow().UtcDateTime
        };
        foreach (var line in lines)
        {
            var item = menu[line.MenuItemId];
            order.Items.Add(new OrderItem
            {
                Id = Guid.CreateVersion7(), RestaurantId = guest.RestaurantId, MenuItemId = item.Id,
                ItemCodeSnapshot = item.ItemCode, NameZhSnapshot = item.NameZh, NameItSnapshot = item.NameIt,
                NameEnSnapshot = item.NameEn, AllergenCodesSnapshot = item.AllergenCodes.ToArray(),
                UnitPriceCents = item.PriceCents, Quantity = line.Quantity, Remark = InputRules.TrimToNull(line.Remark)
            });
        }
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);
        await db.DiningSessions.Where(s => s.Id == session.Id && s.RestaurantId == guest.RestaurantId)
            .ExecuteUpdateAsync(u => u.SetProperty(s => s.BillVersion, s => s.BillVersion + 1), ct);
        // Read PostgreSQL's timestamp precision, so pagination cursors and retry responses agree exactly.
        var saved = await Orders(guest).SingleAsync(o => o.Id == order.Id, ct);
        await transaction.CommitAsync(ct);
        return new(OrderResponse.From(saved), true);
    }

    public async Task<OrderResponse> ByRequestAsync(GuestIdentity guest, Guid sessionId, Guid requestId, CancellationToken ct)
    {
        RequireTarget(guest, sessionId);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await LockSessionAsync(guest, RowLock.Share, ct);
        var order = await Orders(guest).SingleOrDefaultAsync(o => o.ClientRequestId == requestId, ct)
            ?? throw new ApiException(404, "ORDER_NOT_FOUND", "暂未查到这次提交，请继续核对，或使用原请求重试。");
        var result = OrderResponse.From(order);
        await transaction.CommitAsync(ct);
        return result;
    }

    public async Task<OrderPage> ListAsync(GuestIdentity guest, Guid sessionId, string? cursor, int limit, CancellationToken ct)
    {
        RequireTarget(guest, sessionId);
        Paging.EnsureLimit(limit);
        var after = Paging.Decode<OrderCursor>(cursor, c => c.SessionId == sessionId && Paging.IsPosition(c.CreatedAt, c.Id));
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await LockSessionAsync(guest, RowLock.Share, ct);
        var query = Orders(guest);
        if (after is not null)
            query = query.Where(o => EF.Functions.LessThan(ValueTuple.Create(o.CreatedAt, o.Id), ValueTuple.Create(after.CreatedAt, after.Id)));
        var rows = await query.OrderByDescending(o => o.CreatedAt).ThenByDescending(o => o.Id).Take(limit + 1).ToArrayAsync(ct);
        var (page, next) = Paging.Page(rows, limit, last => new OrderCursor(sessionId, last.CreatedAt, last.Id));
        var total = await db.Orders.Where(o => o.RestaurantId == guest.RestaurantId && o.DiningSessionId == sessionId).SelectMany(o => o.Items)
            .Where(i => i.Status != OrderItemStatus.Cancelled).SumAsync(i => i.UnitPriceCents * i.Quantity, ct);
        await transaction.CommitAsync(ct);
        return new(page.Select(OrderResponse.From).ToArray(), next, total);
    }

    private IQueryable<Order> Orders(GuestIdentity guest) => db.Orders.AsNoTracking().Include(o => o.Items)
        .Where(o => o.RestaurantId == guest.RestaurantId && o.DiningSessionId == guest.SessionId);

    private async Task<DiningSession> LockSessionAsync(GuestIdentity guest, RowLock mode, CancellationToken ct)
    {
        // Reading needs only the session lock: no later restaurant/table locks are acquired.
        var session = await RowLocks.SessionAsync(db, guest.RestaurantId, guest.SessionId, mode, ct)
            ?? throw DiningErrors.SessionNotFound();
        if (session.Status != DiningSessionStatus.Active) throw DiningErrors.SessionClosed();
        if (session.TableId != guest.TableId) throw GuestErrors.SessionMismatch();
        return session;
    }

    private static void RequireTarget(GuestIdentity guest, Guid target)
    {
        if (guest.SessionId != target) throw GuestErrors.SessionMismatch();
    }

    private static OrderLineInput[] Validate(CreateOrderInput input)
    {
        if (input.Items is null || input.Items.Length is < 1 or > 30 || input.Items.Any(x => x is null))
            throw OrderErrors.Invalid("items", "每笔订单须包含 1–30 行菜品。");
        var lines = input.Items.Select(x => x!).ToArray();
        foreach (var (line, index) in lines.Select((line, index) => (line, index)))
        {
            if (line.MenuItemId == Guid.Empty || line.Quantity is < 1 or > 20 ||
                line.ExpectedUnitPriceCents < 1 || line.ExpectedUnitPriceCents > MaxCents || line.Remark?.Length > 200)
                throw OrderErrors.Invalid($"items[{index}]", "菜品须有效，每行 1–20 份，备注最多 200 字符，确认价格须为正整数欧分。");
        }
        if (lines.Sum(x => x.Quantity) > 100) throw OrderErrors.Invalid("items", "每单最多 100 份。");
        return lines;
    }

    private sealed record OrderCursor(Guid SessionId, DateTime CreatedAt, Guid Id);
}
