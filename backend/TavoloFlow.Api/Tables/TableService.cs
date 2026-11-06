using System.Security.Cryptography;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Tables;

public sealed class TableService(ApplicationDbContext context, CatalogDeletionService deletion)
{
    private IQueryable<TableResponse> Query(Guid restaurantId, Guid? id = null) =>
        context
            .RestaurantTables.AsNoTracking()
            .Where(x => x.RestaurantId == restaurantId && (id == null || x.Id == id))
            .OrderBy(x => x.Id)
            .Select(x => new TableResponse(
                x.Id,
                x.TableLabel,
                x.IsEnabled,
                "/q/" + x.QrToken,
                x.DiningSessions.Where(s => s.Status == DiningSessionStatus.Active)
                    .Select(s => (Guid?)s.Id)
                    .SingleOrDefault()
            ));

    public Task<TableResponse[]> ReadAsync(Guid restaurantId, CancellationToken ct) =>
        Query(restaurantId).ToArrayAsync(ct);

    public async Task<TableResponse> CreateAsync(
        Guid restaurantId,
        TableLabelInput input,
        CancellationToken ct
    )
    {
        var label = NormalizeLabel(input.TableLabel);
        var table = new RestaurantTable
        {
            RestaurantId = restaurantId,
            TableLabel = label,
            QrToken = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32)),
            IsEnabled = true,
        };
        context.RestaurantTables.Add(table);
        try
        {
            await context.SaveChangesAsync(ct);
        }
        catch (DbUpdateException error) when (IsLabelConflict(error.InnerException))
        {
            throw TableErrors.LabelConflict();
        }

        return new(table.Id, table.TableLabel, table.IsEnabled, "/q/" + table.QrToken, null);
    }

    public Task<TableResponse> RenameAsync(
        Guid restaurantId,
        Guid id,
        TableLabelInput input,
        CancellationToken ct
    )
    {
        var label = NormalizeLabel(input.TableLabel);
        return UpdateAsync(
            restaurantId,
            id,
            () =>
                context
                    .RestaurantTables.Where(x => x.RestaurantId == restaurantId && x.Id == id)
                    .ExecuteUpdateAsync(update => update.SetProperty(x => x.TableLabel, label), ct),
            ct
        );
    }

    public Task<TableResponse> SetEnabledAsync(
        Guid restaurantId,
        Guid id,
        bool enabled,
        CancellationToken ct
    ) =>
        UpdateAsync(
            restaurantId,
            id,
            () =>
                context
                    .RestaurantTables.Where(x => x.RestaurantId == restaurantId && x.Id == id)
                    .ExecuteUpdateAsync(
                        update => update.SetProperty(x => x.IsEnabled, enabled),
                        ct
                    ),
            ct
        );

    private async Task<TableResponse> UpdateAsync(
        Guid restaurantId,
        Guid id,
        Func<Task<int>> update,
        CancellationToken ct
    )
    {
        await using var transaction = await context.Database.BeginTransactionAsync(ct);
        // Opening and deleting the same table take this row lock too.
        if (await RowLocks.TableAsync(context, restaurantId, id, RowLock.Update, ct) is null)
            throw TableErrors.NotFound();
        try
        {
            await update();
            var result = await Query(restaurantId, id).SingleAsync(ct);
            await transaction.CommitAsync(ct);
            return result;
        }
        catch (PostgresException error) when (IsLabelConflict(error))
        {
            throw TableErrors.LabelConflict();
        }
    }

    public async Task DeleteAsync(Guid restaurantId, Guid id, CancellationToken ct)
    {
        // The deletion service owns its transaction; never wrap this call in another one.
        var result = await deletion.DeleteRestaurantTableAsync(restaurantId, id, ct);
        if (result == CatalogDeletionResult.NotFound)
            throw TableErrors.NotFound();
        if (result == CatalogDeletionResult.TableHasActiveSession)
            throw new ApiException(
                409,
                "TABLE_HAS_ACTIVE_SESSION",
                "The table has an open visit: close it before deleting the table."
            );
    }

    private static string NormalizeLabel(string? value)
    {
        var label = value?.Trim();
        if (string.IsNullOrEmpty(label) || label.Length > 50)
            throw ApiException.Validation(
                "Check the table label.",
                "tableLabel",
                "The table label must be 1–50 characters after trimming."
            );
        return label;
    }

    private static bool IsLabelConflict(Exception? error) =>
        error
            is PostgresException
            {
                SqlState: PostgresErrorCodes.UniqueViolation,
                ConstraintName: "uq_tables_label"
            };
}
