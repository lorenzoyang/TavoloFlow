using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Ordering;

// The order lines shared by QR orders and online requests: input format, the menu and price check, and the
// snapshots. Callers hold restaurant SHARE, because menu writers take restaurant UPDATE.
internal static class OrderLines
{
    private const long MaxCents = InputRules.MaxSafeCents;
    private const int MaxOptionsPerLine = 50;

    public static OrderLineInput[] Validate(OrderLineInput?[]? items)
    {
        if (items is null || items.Length is < 1 or > 30 || items.Any(x => x is null))
            throw OrderErrors.Invalid("items", "An order must have 1–30 lines.");
        var lines = items.Select(x => x!).ToArray();
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

    // Checks every line against the current menu and returns the snapshots in input order, or throws
    // MENU_CHANGED listing every dish that no longer matches what the customer confirmed.
    public static async Task<OrderLineSnapshot[]> SnapshotAsync(
        ApplicationDbContext db,
        Guid restaurantId,
        OrderLineInput[] lines,
        CancellationToken ct
    )
    {
        var ids = lines.Select(x => x.MenuItemId).Distinct().ToArray();
        var menu = await db
            .MenuItems.AsNoTracking()
            .Where(x => x.RestaurantId == restaurantId && ids.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);
        var groups = await GroupsAsync(db, restaurantId, ids, ct);
        var changes = new List<MenuChange>();
        var snapshots = new OrderLineSnapshot[lines.Length];
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
                snapshots[index] = new OrderLineSnapshot
                {
                    MenuItemId = item.Id,
                    ItemCode = item.ItemCode,
                    NameZh = item.NameZh,
                    NameIt = item.NameIt,
                    NameEn = item.NameEn,
                    AllergenCodes = choice.AllergenCodes,
                    UnitPriceCents = choice.UnitPriceCents,
                    Quantity = line.Quantity,
                    Remark = InputRules.TrimToNull(line.Remark),
                    Options = choice.Snapshot,
                };
        }
        if (changes.Count > 0)
            throw OrderErrors.MenuChanged(changes.Distinct().ToArray());
        return snapshots;
    }

    // The lines' total, kept within JavaScript's safe integer range.
    public static long Total(IEnumerable<OrderLineSnapshot> lines)
    {
        long total = 0;
        foreach (var line in lines)
        {
            var price = line.UnitPriceCents;
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
        return total;
    }

    // Each ordered dish's option groups, in the restaurant-wide order. Covered by the restaurant SHARE lock,
    // like the dishes themselves; a restaurant without options pays for a single empty query.
    private static async Task<Dictionary<Guid, MenuOptionGroup[]>> GroupsAsync(
        ApplicationDbContext db,
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
}
