using System.Data;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Ordering;

namespace TavoloFlow.Api.Kitchen;

public sealed class KitchenService(ApplicationDbContext db, TimeProvider clock)
{
    public async Task<KitchenPage> ListAsync(Guid restaurantId, string status, string? cursor, int limit, CancellationToken ct)
    {
        var state = ParseStatus(status);
        if (limit is < 1 or > 100) throw OrderErrors.Invalid("limit", "每页数量须为 1–100。");
        var after = DecodeCursor(cursor, restaurantId, status);
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var active = Orders(restaurantId).Where(o => o.DiningSession.Status == DiningSessionStatus.Active);
        var filtered = active.Where(o => o.Status == state);
        var total = await filtered.LongCountAsync(ct);
        var pending = await active.LongCountAsync(o => o.Status == OrderStatus.New, ct);
        // Includes closed/cancelled orders: processing and closing must not look like new submissions.
        var created = await db.Orders.LongCountAsync(o => o.RestaurantId == restaurantId, ct);
        if (after is not null)
        {
            filtered = state == OrderStatus.New
                ? filtered.Where(o => EF.Functions.GreaterThan(ValueTuple.Create(o.CreatedAt, o.Id), ValueTuple.Create(after.At, after.Id)))
                : filtered.Where(o => EF.Functions.LessThan(ValueTuple.Create(state == OrderStatus.Ready ? o.ReadyAt!.Value : o.CancelledAt!.Value, o.Id), ValueTuple.Create(after.At, after.Id)));
        }
        var sorted = state == OrderStatus.New
            ? filtered.OrderBy(o => o.CreatedAt).ThenBy(o => o.Id)
            : filtered.OrderByDescending(o => state == OrderStatus.Ready ? o.ReadyAt : o.CancelledAt).ThenByDescending(o => o.Id);
        var rows = await sorted.Take(limit + 1).ToArrayAsync(ct);
        var page = rows.Take(limit).ToArray();
        var next = rows.Length > limit ? WebEncoders.Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(
            new Cursor(restaurantId, status, SortTime(page[^1], state), page[^1].Id))) : null;
        await tx.CommitAsync(ct);
        return new(page.Select(KitchenOrderResponse.From).ToArray(), next, total, pending, created);
    }

    public async Task<KitchenOrderResponse> ReadAsync(Guid restaurantId, Guid id, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LockSessionAsync(restaurantId, id, false, ct);
        var result = KitchenOrderResponse.From(await FindAsync(restaurantId, id, ct));
        await tx.CommitAsync(ct);
        return result;
    }

    public Task<KitchenOrderResponse> ReadyAsync(Guid restaurantId, Guid id, CancellationToken ct) =>
        ChangeAsync(restaurantId, id, OrderStatus.New, null, ct);

    public async Task<KitchenOrderResponse> CancelAsync(Guid restaurantId, Guid id, RestaurantUserRole role,
        CancelOrderInput input, CancellationToken ct)
    {
        var expected = input.ExpectedStatus switch
        {
            "NEW" => OrderStatus.New,
            "READY" => OrderStatus.Ready,
            _ => throw OrderErrors.Invalid("expectedStatus", "请确认订单当前为待处理或已完成。")
        };
        var reason = input.Reason?.Trim();
        if (string.IsNullOrEmpty(reason) || reason.Length > 500)
            throw OrderErrors.Invalid("reason", "取消原因须为 1–500 个字符。");
        // Resolve ownership before role-specific errors so foreign IDs remain indistinguishable from missing ones.
        await SessionIdAsync(restaurantId, id, ct);
        if (expected == OrderStatus.Ready && role != RestaurantUserRole.Owner)
            throw new ApiException(403, "FORBIDDEN", "只有老板可以作废已完成的订单。");
        return await ChangeAsync(restaurantId, id, expected, reason, ct);
    }

    private async Task<KitchenOrderResponse> ChangeAsync(Guid restaurantId, Guid id, OrderStatus expected,
        string? reason, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Same session UPDATE lock as ordering/closure. Never acquire restaurant or table locks afterwards.
        var session = await LockSessionAsync(restaurantId, id, true, ct);
        var order = await FindAsync(restaurantId, id, ct);
        if (order.Status != expected) throw Changed();
        if (reason is not null && session.BillVersion == int.MaxValue)
            throw new ApiException(409, "BILL_LIMIT_REACHED", "本轮账单版本已达到支持的上限，请联系管理员。");
        var now = clock.GetUtcNow().UtcDateTime;
        // Keep lifecycle timestamps valid even if the host clock moves backwards.
        var earliest = order.ReadyAt ?? order.CreatedAt;
        if (now < earliest) now = earliest;
        var target = db.Orders.Where(o => o.RestaurantId == restaurantId && o.Id == id &&
            o.DiningSessionId == session.Id && o.Status == expected);
        var changed = reason is null
            ? await target.ExecuteUpdateAsync(u => u.SetProperty(o => o.Status, OrderStatus.Ready).SetProperty(o => o.ReadyAt, now), ct)
            : await target.ExecuteUpdateAsync(u => u.SetProperty(o => o.Status, OrderStatus.Cancelled)
                .SetProperty(o => o.CancelledAt, now).SetProperty(o => o.CancelReason, reason), ct);
        if (changed != 1) throw Changed();
        if (reason is not null)
            await db.DiningSessions.Where(s => s.RestaurantId == restaurantId && s.Id == session.Id)
                .ExecuteUpdateAsync(u => u.SetProperty(s => s.BillVersion, s => s.BillVersion + 1), ct);
        var result = KitchenOrderResponse.From(await FindAsync(restaurantId, id, ct));
        await tx.CommitAsync(ct);
        return result;
    }

    private IQueryable<Order> Orders(Guid restaurantId) => db.Orders.AsNoTracking()
        .Include(o => o.Items).Include(o => o.DiningSession).Where(o => o.RestaurantId == restaurantId);

    private async Task<Order> FindAsync(Guid restaurantId, Guid id, CancellationToken ct) =>
        await Orders(restaurantId).SingleOrDefaultAsync(o => o.Id == id, ct) ?? throw Missing();

    private async Task<Guid> SessionIdAsync(Guid restaurantId, Guid id, CancellationToken ct) =>
        await db.Orders.Where(o => o.RestaurantId == restaurantId && o.Id == id)
            .Select(o => (Guid?)o.DiningSessionId).SingleOrDefaultAsync(ct) ?? throw Missing();

    private async Task<DiningSession> LockSessionAsync(Guid restaurantId, Guid id, bool update, CancellationToken ct)
    {
        var sessionId = await SessionIdAsync(restaurantId, id, ct);
        var session = await DiningLocks.SessionAsync(db, restaurantId, sessionId, update, ct);
        if (session.Status != DiningSessionStatus.Active) throw DiningErrors.SessionClosed();
        return session;
    }

    private static ApiException Missing() => new(404, "ORDER_NOT_FOUND", "订单不存在。");
    private static ApiException Changed() => new(409, "ORDER_CHANGED", "订单状态已变化，请重新读取并确认。");
    private static OrderStatus ParseStatus(string status) => status switch
    {
        "NEW" => OrderStatus.New, "READY" => OrderStatus.Ready, "CANCELLED" => OrderStatus.Cancelled,
        _ => throw OrderErrors.Invalid("status", "订单状态须为 NEW、READY 或 CANCELLED。")
    };
    private static DateTime SortTime(Order order, OrderStatus status) => status switch
    {
        OrderStatus.New => order.CreatedAt, OrderStatus.Ready => order.ReadyAt!.Value, _ => order.CancelledAt!.Value
    };
    private sealed record Cursor(Guid RestaurantId, string Status, DateTime At, Guid Id);
    private static Cursor? DecodeCursor(string? raw, Guid restaurantId, string status)
    {
        if (raw is null) return null;
        try
        {
            if (raw.Length > 512) throw new FormatException();
            var value = JsonSerializer.Deserialize<Cursor>(WebEncoders.Base64UrlDecode(raw));
            if (value is null || value.RestaurantId != restaurantId || value.Status != status ||
                value.Id == Guid.Empty || value.At.Kind != DateTimeKind.Utc) throw new FormatException();
            return value;
        }
        catch (Exception e) when (e is FormatException or JsonException or ArgumentException)
        { throw OrderErrors.Invalid("cursor", "分页位置无效，请重新读取订单。"); }
    }
}
