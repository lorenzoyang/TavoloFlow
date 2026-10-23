using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Guests;
using TavoloFlow.Api.Menus;

namespace TavoloFlow.Api.Ordering;

public sealed class OrderService(ApplicationDbContext db, TimeProvider clock)
{
    public const long MaxAmountCents = MenuValidation.MaxPriceCents;

    public async Task<OrderCreation> CreateAsync(GuestIdentity guest, CreateOrderInput input, CancellationToken ct)
    {
        if (input.SessionId is null || input.SessionId == Guid.Empty || input.ClientRequestId is null || input.ClientRequestId == Guid.Empty)
            throw OrderException.Invalid("sessionId", "请提供有效的用餐和请求标识。");
        RequireTarget(guest, input.SessionId.Value);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        
        // Menu writers/deletion take restaurant UPDATE first. SHARE protects prices and snapshots without serializing different tables.
        var restaurant = await DiningLocks.RestaurantAsync(db, guest.RestaurantId, ct);
        var table = await DiningLocks.TableAsync(db, guest.RestaurantId, guest.TableId, false, ct);
        var session = await LockSessionAsync(guest, true, ct);
        var original = await Orders(guest).SingleOrDefaultAsync(o => o.ClientRequestId == input.ClientRequestId, ct);
        if (original is not null)
        {
            await transaction.CommitAsync(ct);
            return new(OrderResponse.From(original), false);
        }

        DiningLocks.RequireEntrance(restaurant, table);
        if (!restaurant.OrderingEnabled)
            throw new OrderException(409, "ORDERING_PAUSED", "餐厅暂未接受扫码订单。");
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
            throw new OrderException(409, "MENU_CHANGED", "菜品信息已变化，请重新核对菜单和金额。", changes: changes.Distinct().ToArray());

        long total = 0;
        foreach (var line in lines)
        {
            var price = menu[line.MenuItemId].PriceCents;
            if (price <= 0 || price > MaxAmountCents / line.Quantity || total > MaxAmountCents - price * line.Quantity)
                throw OrderException.Invalid("items", "订单金额超出安全整数范围。");
            total += price * line.Quantity;
        }
        var existingTotal = await db.Orders.Where(o => o.RestaurantId == guest.RestaurantId &&
            o.DiningSessionId == guest.SessionId && o.Status != OrderStatus.Cancelled).SumAsync(o => o.TotalAmountCents, ct);
        if (existingTotal > MaxAmountCents - total || session.BillVersion == int.MaxValue)
            throw new OrderException(409, "BILL_LIMIT_REACHED", "本轮账单已达到支持的上限，请联系工作人员。");

        var order = new Order
        {
            Id = Guid.CreateVersion7(), RestaurantId = guest.RestaurantId, DiningSessionId = guest.SessionId,
            ClientRequestId = input.ClientRequestId.Value, TotalAmountCents = total,
            OrderNote = Clean(input.OrderNote), DefaultLanguageSnapshot = restaurant.DefaultLanguage,
            CreatedAt = clock.GetUtcNow().UtcDateTime
        };
        foreach (var line in lines)
        {
            var item = menu[line.MenuItemId];
            order.Items.Add(new OrderItem
            {
                Id = Guid.CreateVersion7(), RestaurantId = guest.RestaurantId, MenuItemId = item.Id,
                ItemCodeSnapshot = item.ItemCode, NameZhSnapshot = item.NameZh, NameItSnapshot = item.NameIt,
                NameEnSnapshot = item.NameEn, AllergenCodesSnapshot = item.AllergenCodes.ToArray(),
                UnitPriceCents = item.PriceCents, Quantity = line.Quantity, Remark = Clean(line.Remark)
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
        await LockSessionAsync(guest, false, ct);
        var order = await Orders(guest).SingleOrDefaultAsync(o => o.ClientRequestId == requestId, ct)
            ?? throw new OrderException(404, "ORDER_NOT_FOUND", "暂未查到这次提交，请继续核对，或使用原请求重试。");
        var result = OrderResponse.From(order);
        await transaction.CommitAsync(ct);
        return result;
    }

    public async Task<OrderPage> ListAsync(GuestIdentity guest, Guid sessionId, string? cursor, int limit, CancellationToken ct)
    {
        RequireTarget(guest, sessionId);
        if (limit is < 1 or > 100) throw OrderException.Invalid("limit", "每页数量须为 1–100。");
        var after = DecodeCursor(cursor, sessionId);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await LockSessionAsync(guest, false, ct);
        var query = Orders(guest);
        if (after is not null)
            query = query.Where(o => EF.Functions.LessThan(ValueTuple.Create(o.CreatedAt, o.Id), ValueTuple.Create(after.CreatedAt, after.Id)));
        var rows = await query.OrderByDescending(o => o.CreatedAt).ThenByDescending(o => o.Id).Take(limit + 1).ToArrayAsync(ct);
        var page = rows.Take(limit).ToArray();
        var total = await db.Orders.Where(o => o.RestaurantId == guest.RestaurantId && o.DiningSessionId == sessionId &&
            o.Status != OrderStatus.Cancelled).SumAsync(o => o.TotalAmountCents, ct);
        var next = rows.Length > limit ? WebEncoders.Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(
            new OrderCursor(sessionId, page[^1].CreatedAt, page[^1].Id))) : null;
        await transaction.CommitAsync(ct);
        return new(page.Select(OrderResponse.From).ToArray(), next, total);
    }

    private IQueryable<Order> Orders(GuestIdentity guest) => db.Orders.AsNoTracking().Include(o => o.Items)
        .Where(o => o.RestaurantId == guest.RestaurantId && o.DiningSessionId == guest.SessionId);

    private async Task<DiningSession> LockSessionAsync(GuestIdentity guest, bool update, CancellationToken ct)
    {
        // Reading needs only the session lock: no later restaurant/table locks are acquired.
        var session = await DiningLocks.SessionAsync(db, guest.RestaurantId, guest.SessionId, update, ct);
        if (session.Status != DiningSessionStatus.Active) throw DiningException.Closed();
        if (session.TableId != guest.TableId) throw Mismatch();
        return session;
    }

    private static void RequireTarget(GuestIdentity guest, Guid target)
    {
        if (guest.SessionId != target) throw Mismatch();
    }
    private static DiningException Mismatch() => new(403, "GUEST_SESSION_MISMATCH", "当前浏览器授权属于另一轮用餐，请重新验证。");
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static OrderLineInput[] Validate(CreateOrderInput input)
    {
        if (input.Items is null || input.Items.Length is < 1 or > 30 || input.Items.Any(x => x is null))
            throw OrderException.Invalid("items", "每笔订单须包含 1–30 行菜品。");
        if (input.OrderNote?.Length > 500) throw OrderException.Invalid("orderNote", "整单备注最多 500 个字符。");
        var lines = input.Items.Select(x => x!).ToArray();
        foreach (var (line, index) in lines.Select((line, index) => (line, index)))
        {
            if (line.MenuItemId == Guid.Empty || line.Quantity is < 1 or > 20 ||
                line.ExpectedUnitPriceCents < 1 || line.ExpectedUnitPriceCents > MaxAmountCents || line.Remark?.Length > 200)
                throw OrderException.Invalid($"items[{index}]", "菜品须有效，每行 1–20 份，备注最多 200 字符，确认价格须为正整数欧分。");
        }
        if (lines.Sum(x => x.Quantity) > 100) throw OrderException.Invalid("items", "每单最多 100 份。");
        return lines;
    }

    private sealed record OrderCursor(Guid SessionId, DateTime CreatedAt, Guid Id);
    private static OrderCursor? DecodeCursor(string? raw, Guid sessionId)
    {
        if (raw is null) return null;
        try
        {
            if (raw.Length > 512) throw new FormatException();
            var cursor = JsonSerializer.Deserialize<OrderCursor>(WebEncoders.Base64UrlDecode(raw));
            if (cursor is null || cursor.SessionId != sessionId || cursor.Id == Guid.Empty || cursor.CreatedAt.Kind != DateTimeKind.Utc)
                throw new FormatException();
            return cursor;
        }
        catch (Exception error) when (error is FormatException or JsonException or ArgumentException)
        {
            throw OrderException.Invalid("cursor", "分页位置无效，请重新读取订单。");
        }
    }
}
