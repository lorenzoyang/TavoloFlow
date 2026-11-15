using System.Data;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Menus;

namespace TavoloFlow.Api.Online;

// The anonymous online menu: the same menu as the QR page, plus whether customers can order now.
public sealed class OnlineMenuService(ApplicationDbContext db, TimeProvider clock)
{
    public async Task<OnlineMenuResponse> ReadAsync(string slug, CancellationToken ct)
    {
        if (!InputRules.IsSlug(slug))
            throw OnlineErrors.LinkNotFound();
        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.RepeatableRead,
            ct
        );
        var restaurant =
            await db.Restaurants.AsNoTracking().SingleOrDefaultAsync(r => r.Slug == slug, ct)
            ?? throw OnlineErrors.LinkNotFound();
        var (_, availability) = await OnlineAvailability.ReadAsync(
            db,
            restaurant,
            clock.GetUtcNow(),
            ct
        );
        var menu = await MenuReader.ReadAsync(db, restaurant.Id, restaurant.DefaultLanguage, ct);
        await transaction.CommitAsync(ct);
        return new(
            new(
                restaurant.Id,
                restaurant.Name,
                restaurant.CurrencyCode,
                restaurant.DefaultLanguage,
                ApiEnum.Text(restaurant.Theme),
                restaurant.PublicPhone,
                restaurant.DeliveryEnabled,
                restaurant.DeliveryNoteZh,
                restaurant.DeliveryNoteIt,
                restaurant.DeliveryNoteEn
            ),
            availability.Status,
            availability.NextOpensAt,
            new(menu.AvailableLanguages, menu.Categories, menu.Items, menu.OptionGroups)
        );
    }
}
