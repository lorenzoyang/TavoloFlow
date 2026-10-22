using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Dining;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Guests;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record JoinInput([Required] Guid? SessionId, [Required, StringLength(32)] string JoinCode);
public sealed record GuestAccessResponse(Guid RestaurantId, Guid TableId, Guid SessionId, string Status,
    string ServiceStatus, bool IsTableEnabled, bool OrderingEnabled);

public sealed class GuestService(ApplicationDbContext db, JoinCodes codes)
{
    public async Task<GuestIdentity> JoinAsync(string token, JoinInput input, CancellationToken ct)
    {
        var code = input.JoinCode.Trim().ToUpperInvariant();

        if (input.SessionId is null || input.SessionId == Guid.Empty || code.Length != 4 || code.Any(c => !JoinCodes.Alphabet.Contains(c)))
            throw new DiningException(400, "VALIDATION_FAILED", "请输入四位入桌码并确认当前用餐。");

        if (token.Length > 128) throw InvalidQr();

        var entrance = await db.RestaurantTables.AsNoTracking().Where(x => x.QrToken == token)
            .Select(x => new { x.Id, x.RestaurantId }).SingleOrDefaultAsync(ct) ?? throw InvalidQr();

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var restaurant = await DiningLocks.RestaurantAsync(db, entrance.RestaurantId, ct);
        var table = await DiningLocks.TableAsync(db, entrance.RestaurantId, entrance.Id, false, ct);
        if (table.QrToken != token) throw InvalidQr();
        DiningLocks.RequireEntrance(restaurant, table);
        var session = await DiningLocks.SessionAsync(db, restaurant.Id, input.SessionId.Value, false, ct);
        if (session.TableId != table.Id) throw DiningException.Missing();
        if (session.Status != DiningSessionStatus.Active) throw DiningException.Closed();
        if (!codes.Matches(session, code))
            throw new DiningException(401, "JOIN_CODE_INCORRECT", "入桌码不正确，请向同桌顾客或工作人员确认。");
        
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
                Enabled = s.Table != null && s.Table.IsEnabled }).SingleOrDefaultAsync(ct) ?? throw DiningException.Missing();
        if (state.Status != DiningSessionStatus.Active) throw DiningException.Closed();
        if (state.TableId != guest.TableId) throw Mismatch();
        return new(guest.RestaurantId, guest.TableId, target, "ACTIVE", state.ServiceStatus.ToString().ToUpperInvariant(),
            state.Enabled, state.OrderingEnabled);
    }

    public async Task<JoinCodeResponse> ReadCodeAsync(GuestIdentity guest, Guid target, CancellationToken ct)
    {
        RequireTarget(guest, target);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var restaurant = await DiningLocks.RestaurantAsync(db, guest.RestaurantId, ct);
        var table = await DiningLocks.TableAsync(db, guest.RestaurantId, guest.TableId, false, ct);
        var session = await DiningLocks.SessionAsync(db, guest.RestaurantId, target, false, ct);
        if (session.Status != DiningSessionStatus.Active) throw DiningException.Closed();
        if (session.TableId != guest.TableId) throw Mismatch();
        DiningLocks.RequireEntrance(restaurant, table);
        var result = new JoinCodeResponse(target, codes.Read(session));
        await transaction.CommitAsync(ct);
        return result;
    }

    private static void RequireTarget(GuestIdentity guest, Guid target)
    {
        if (guest.SessionId != target) throw Mismatch();
    }
    private static DiningException Mismatch() => new(403, "GUEST_SESSION_MISMATCH", "当前浏览器授权属于另一轮用餐，请重新验证。");
    private static DiningException InvalidQr() => new(404, "QR_NOT_FOUND", "二维码无效，请联系工作人员。");
}
