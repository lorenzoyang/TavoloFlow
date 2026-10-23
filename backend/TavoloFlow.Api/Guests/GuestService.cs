using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Guests;

public sealed class GuestService(ApplicationDbContext db, JoinCodes codes)
{
    public async Task<GuestIdentity> JoinAsync(string token, JoinInput input, CancellationToken ct)
    {
        var code = input.JoinCode.Trim().ToUpperInvariant();

        if (input.SessionId is null || input.SessionId == Guid.Empty || code.Length != 4 || code.Any(c => !JoinCodes.Alphabet.Contains(c)))
            throw ApiException.Validation("请输入四位入桌码并确认当前用餐。");

        if (token.Length > 128) throw GuestErrors.QrNotFound();

        var entrance = await db.RestaurantTables.AsNoTracking().Where(x => x.QrToken == token)
            .Select(x => new { x.Id, x.RestaurantId }).SingleOrDefaultAsync(ct) ?? throw GuestErrors.QrNotFound();

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var restaurant = await DiningLocks.RestaurantAsync(db, entrance.RestaurantId, ct);
        var table = await DiningLocks.TableAsync(db, entrance.RestaurantId, entrance.Id, false, ct);
        if (table.QrToken != token) throw GuestErrors.QrNotFound();
        DiningLocks.RequireEntrance(restaurant, table);
        var session = await DiningLocks.SessionAsync(db, restaurant.Id, input.SessionId.Value, false, ct);
        if (session.TableId != table.Id) throw DiningErrors.SessionNotFound();
        if (session.Status != DiningSessionStatus.Active) throw DiningErrors.SessionClosed();
        if (!codes.Matches(session, code))
            throw new ApiException(401, "JOIN_CODE_INCORRECT", "入桌码不正确，请向同桌顾客或工作人员确认。");
        
        await transaction.CommitAsync(ct);
        
        return new(restaurant.Id, table.Id, session.Id);
    }

    public async Task<GuestAccessResponse> AccessAsync(GuestIdentity guest, Guid target, CancellationToken ct)
    {
        RequireTarget(guest, target);
        // One SQL statement gives a consistent view. Do not expose closed history to a guest.
        var state = await db.DiningSessions.AsNoTracking()
            .Where(s => s.Id == target && s.RestaurantId == guest.RestaurantId)
            .Select(s => new { s.Status, s.TableId, s.Restaurant.ServiceStatus, s.Restaurant.OrderingEnabled,
                Enabled = s.Table != null && s.Table.IsEnabled }).SingleOrDefaultAsync(ct) ?? throw DiningErrors.SessionNotFound();
        if (state.Status != DiningSessionStatus.Active) throw DiningErrors.SessionClosed();
        if (state.TableId != guest.TableId) throw GuestErrors.SessionMismatch();
        return new(guest.RestaurantId, guest.TableId, target, "ACTIVE", ApiEnum.Text(state.ServiceStatus),
            state.Enabled, state.OrderingEnabled);
    }

    public async Task<JoinCodeResponse> ReadCodeAsync(GuestIdentity guest, Guid target, CancellationToken ct)
    {
        RequireTarget(guest, target);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var restaurant = await DiningLocks.RestaurantAsync(db, guest.RestaurantId, ct);
        var table = await DiningLocks.TableAsync(db, guest.RestaurantId, guest.TableId, false, ct);
        var session = await DiningLocks.SessionAsync(db, guest.RestaurantId, target, false, ct);
        if (session.Status != DiningSessionStatus.Active) throw DiningErrors.SessionClosed();
        if (session.TableId != guest.TableId) throw GuestErrors.SessionMismatch();
        DiningLocks.RequireEntrance(restaurant, table);
        var result = new JoinCodeResponse(target, codes.Read(session));
        await transaction.CommitAsync(ct);
        return result;
    }

    private static void RequireTarget(GuestIdentity guest, Guid target)
    {
        if (guest.SessionId != target) throw GuestErrors.SessionMismatch();
    }
}
