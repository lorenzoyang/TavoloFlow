using System.Data;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Menus;

public sealed record PublicRestaurantResponse(Guid Id, string Name, string CurrencyCode, string DefaultLanguage,
    string ServiceStatus, bool OrderingEnabled);
public sealed record PublicTableResponse(Guid Id, string TableLabel, bool IsEnabled);
public sealed record PublicMenuContent(string[] AvailableLanguages, CategoryResponse[] Categories, MenuItemResponse[] Items);
public sealed record PublicMenuResponse(PublicRestaurantResponse Restaurant, PublicTableResponse Table,
    Guid? ActiveSessionId, PublicMenuContent Menu);

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
                x.Restaurant.OrderingEnabled,
                ActiveSessionId = x.DiningSessions.Where(s => s.Status == DiningSessionStatus.Active)
                    .Select(s => (Guid?)s.Id).SingleOrDefault()
            }).SingleOrDefaultAsync(ct) ?? throw NotFound();
        var menu = await MenuReader.ReadAsync(context, entrance.RestaurantId, entrance.DefaultLanguage, ct);
        await transaction.CommitAsync(ct);
        return new(new(entrance.RestaurantId, entrance.Name, entrance.CurrencyCode, entrance.DefaultLanguage,
                entrance.ServiceStatus.ToString().ToUpperInvariant(), entrance.OrderingEnabled),
            new(entrance.Id, entrance.TableLabel, entrance.IsEnabled), entrance.ActiveSessionId,
            new(menu.AvailableLanguages, menu.Categories, menu.Items));
    }

    private static MenuException NotFound() => new(404, "QR_NOT_FOUND", "二维码无效，请联系餐厅工作人员。");
}
