using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Ordering;

// One submitted line, named and priced from the menu at submission time. Guest orders store it as an order
// item; pickup requests store it first and copy it into an order item when staff accept the request.
public sealed record OrderLineSnapshot(Guid MenuItemId, string? ItemCode, string? NameZh, string? NameIt,
    string? NameEn, string[] AllergenCodes, long UnitPriceCents, int Quantity, string? Remark)
{
    public OrderItem ToOrderItem(Guid restaurantId) => new()
    {
        Id = Guid.CreateVersion7(), RestaurantId = restaurantId, MenuItemId = MenuItemId,
        ItemCodeSnapshot = ItemCode, NameZhSnapshot = NameZh, NameItSnapshot = NameIt, NameEnSnapshot = NameEn,
        AllergenCodesSnapshot = AllergenCodes.ToArray(), UnitPriceCents = UnitPriceCents, Quantity = Quantity, Remark = Remark
    };
}

// The line rules every submission channel shares: limits, availability, confirmed prices and safe totals.
public static class OrderLines
{
    private const long MaxCents = InputRules.MaxSafeCents;

    public static OrderLineInput[] Validate(OrderLineInput?[]? items)
    {
        if (items is null || items.Length is < 1 or > 30 || items.Any(x => x is null))
            throw OrderErrors.Invalid("items", "每笔订单须包含 1–30 行菜品。");
        var lines = items.Select(x => x!).ToArray();
        foreach (var (line, index) in lines.Select((line, index) => (line, index)))
        {
            if (line.MenuItemId == Guid.Empty || line.Quantity is < 1 or > 20 ||
                line.ExpectedUnitPriceCents < 1 || line.ExpectedUnitPriceCents > MaxCents || line.Remark?.Length > 200)
                throw OrderErrors.Invalid($"items[{index}]", "菜品须有效，每行 1–20 份，备注最多 200 字符，确认价格须为正整数欧分。");
        }
        if (lines.Sum(x => x.Quantity) > 100) throw OrderErrors.Invalid("items", "每单最多 100 份。");
        return lines;
    }

    // The caller holds the restaurant SHARE lock: menu writers and item deletion take restaurant UPDATE, so the
    // menu read here stays the menu the snapshot is saved from.
    public static async Task<(OrderLineSnapshot[] Lines, long Total)> BuildAsync(ApplicationDbContext db,
        Guid restaurantId, OrderLineInput[] lines, CancellationToken ct)
    {
        var ids = lines.Select(x => x.MenuItemId).Distinct().ToArray();
        var menu = await db.MenuItems.AsNoTracking().Where(x => x.RestaurantId == restaurantId && ids.Contains(x.Id))
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
        var snapshots = lines.Select(line =>
        {
            var item = menu[line.MenuItemId];
            return new OrderLineSnapshot(item.Id, item.ItemCode, item.NameZh, item.NameIt, item.NameEn,
                item.AllergenCodes.ToArray(), item.PriceCents, line.Quantity, InputRules.TrimToNull(line.Remark));
        }).ToArray();
        return (snapshots, total);
    }
}
