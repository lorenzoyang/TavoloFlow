using System.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Menus;

namespace TavoloFlow.Api.Online;

// The anonymous online menu: the same menu as the QR page, plus whether customers can order now.
public sealed class OnlineMenuService(
    ApplicationDbContext db,
    TimeProvider clock,
    IOptions<TurnstileOptions> verification,
    DeliveryQuoteService quotes
)
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
        var tiers = await OnlineDelivery.TiersAsync(db, restaurant.Id, ct);
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
                restaurant.DeliveryNoteEn,
                restaurant.DeliveryMinOrderCents,
                tiers,
                quotes.AutoQuote(restaurant, tiers)
            ),
            availability.Status,
            availability.NextOpensAt,
            new(menu.AvailableLanguages, menu.Categories, menu.Items, menu.OptionGroups),
            verification.Value.Public
        );
    }

    // Checkout's coupon check: the code customers typed, valid today in the restaurant's time zone.
    // Rate-limited per IP by the controller, so codes are not guessed by trying them all.
    public async Task<OnlineCouponPreviewResponse> CouponAsync(
        string slug,
        string code,
        CancellationToken ct
    )
    {
        if (!InputRules.IsSlug(slug))
            throw OnlineErrors.LinkNotFound();
        var restaurant =
            await db.Restaurants.AsNoTracking().SingleOrDefaultAsync(r => r.Slug == slug, ct)
            ?? throw OnlineErrors.LinkNotFound();
        var normalized = OnlineCoupons.Normalize(code) ?? throw OnlineErrors.CouponNotFound();
        var coupon = await db
            .OnlineCoupons.AsNoTracking()
            .SingleOrDefaultAsync(c => c.RestaurantId == restaurant.Id && c.Code == normalized, ct);
        var today = DateOnly.FromDateTime(
            OnlineSchedule.Local(
                TimeZoneInfo.FindSystemTimeZoneById(restaurant.TimeZone),
                clock.GetUtcNow()
            )
        );
        return coupon is not null && OnlineCoupons.IsValid(coupon, today)
            ? new(coupon.Code, coupon.PercentOff)
            : throw OnlineErrors.CouponNotFound();
    }
}
