using System.Data;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Menus;

public sealed class PublicMenuService(ApplicationDbContext context)
{
    public async Task<PublicMenuResponse> ReadAsync(string token, CancellationToken ct)
    {
        if (token.Length > 128) throw NotFound();
        await using var transaction = await context.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var entrance = await context.RestaurantTables.AsNoTracking().Where(x => x.QrToken == token)
            .Select(x => new
            {
                x.Id,
                x.TableLabel,
                x.IsEnabled,
                x.RestaurantId,
                x.Restaurant.Name,
                x.Restaurant.CurrencyCode,
                x.Restaurant.DefaultLanguage,
                x.Restaurant.ServiceStatus,
                x.Restaurant.DineInEnabled,
                x.Restaurant.OrderingEnabled,
                x.Restaurant.JoinCodeRequired,
                x.Restaurant.Theme,
                ActiveSessionId = x.DiningSessions.Where(s => s.Status == DiningSessionStatus.Active)
                    .Select(s => (Guid?)s.Id).SingleOrDefault()
            }).SingleOrDefaultAsync(ct) ?? throw NotFound();
        var menu = await MenuReader.ReadAsync(context, entrance.RestaurantId, entrance.DefaultLanguage, ct);
        await transaction.CommitAsync(ct);
        return new(new(entrance.RestaurantId, entrance.Name, entrance.CurrencyCode, entrance.DefaultLanguage,
                ApiEnum.Text(entrance.ServiceStatus), entrance.DineInEnabled, entrance.OrderingEnabled, entrance.JoinCodeRequired,
                ApiEnum.Text(entrance.Theme)),
            new(entrance.Id, entrance.TableLabel, entrance.IsEnabled), entrance.ActiveSessionId,
            new(menu.AvailableLanguages, menu.Categories, menu.Items));
    }

    // Image URLs carry no tenant: the id is random and the photo is already public on that restaurant's menu.
    public async Task<byte[]> ReadImageAsync(Guid imageId, CancellationToken ct) =>
        await context.MenuItemImages.Where(x => x.Id == imageId).Select(x => x.Content).SingleOrDefaultAsync(ct)
            ?? throw MenuErrors.ImageNotFound();

    private static ApiException NotFound() => new(404, "QR_NOT_FOUND", "二维码无效，请联系餐厅工作人员。");
}
