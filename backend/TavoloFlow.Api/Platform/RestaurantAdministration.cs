using System.Data;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Platform;

public sealed class RestaurantAdministration(ApplicationDbContext db, IPasswordHasher<RestaurantUser> hasher,
    ILogger<RestaurantAdministration> logger)
{
    public async Task<RestaurantPage> ListAsync(string? search, string? status, int page, int pageSize, CancellationToken ct)
    {
        RestaurantServiceStatus? state = null;
        if (ApiEnum.TryParse(status, out RestaurantServiceStatus parsed)) state = parsed;
        if (page < 1 || page > 100000 || pageSize is < 1 or > 100 || search?.Length > 150 ||
            (status is not null && state is null))
            throw ApiException.Validation("请检查分页、名称和状态筛选。");
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var query = db.Restaurants.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search)) query = query.Where(r => r.Name.Contains(search.Trim()));
        if (state is { } filter) query = query.Where(r => r.ServiceStatus == filter);
        var total = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(r => r.CreatedAt).ThenByDescending(r => r.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        await transaction.CommitAsync(ct);
        return new(rows.Select(RestaurantSummary.From).ToArray(), total, page, pageSize);
    }

    public async Task<RestaurantDetail> ReadAsync(Guid id, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var restaurant = await db.Restaurants.AsNoTracking().SingleOrDefaultAsync(r => r.Id == id, ct)
            ?? throw AdministrationErrors.RestaurantNotFound();
        var users = await db.RestaurantUsers.AsNoTracking().Where(u => u.RestaurantId == id).OrderBy(u => u.Role).ToArrayAsync(ct);
        await transaction.CommitAsync(ct);
        return new(RestaurantSummary.From(restaurant), users.Select(ManagedAccount.From).ToArray());
    }

    public async Task<CreatedRestaurant> CreateAsync(CreateRestaurantInput input, Guid actor, CancellationToken ct)
    {
        var owner = AccountInput.NormalizeUsername(input.OwnerUsername);
        var staff = AccountInput.NormalizeUsername(input.StaffUsername);
        if (input.Id == Guid.Empty || string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 150 ||
            owner.Length is < 1 or > 50 || staff.Length is < 1 or > 50 || owner == staff ||
            !InputRules.IsLanguage(input.DefaultLanguage))
            throw ApiException.Validation("请填写餐厅名称、语言和两个不同的登录名。");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        if (await db.Restaurants.AnyAsync(r => r.Id == input.Id, ct))
            throw new ApiException(409, "RESTAURANT_EXISTS", "此创建标识已存在，请核对原餐厅。");
        var restaurant = new Restaurant { Id = input.Id, Name = input.Name.Trim(), DefaultLanguage = input.DefaultLanguage };
        var credentials = new List<TemporaryAccount>();
        foreach (var (name, role) in new[] { (owner, RestaurantUserRole.Owner), (staff, RestaurantUserRole.Staff) })
        {
            var password = NewPassword();
            var user = new RestaurantUser { Id = Guid.CreateVersion7(), RestaurantId = restaurant.Id,
                Username = name, Role = role, PasswordHash = "" };
            user.PasswordHash = hasher.HashPassword(user, password);
            restaurant.Users.Add(user);
            credentials.Add(new(ManagedAccount.From(user), password));
        }
        db.Restaurants.Add(restaurant);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException error) when (error.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        { throw new ApiException(409, "CREATE_CONFLICT", "餐厅标识或登录名已被使用，请核对原结果或修改登录名。"); }
        await transaction.CommitAsync(ct);
        logger.LogInformation("Platform {ActorId} created restaurant {RestaurantId}.", actor, restaurant.Id);
        return new(RestaurantSummary.From(restaurant), credentials.ToArray());
    }

    public async Task<RestaurantSummary> SetStatusAsync(Guid id, string status, Guid actor, CancellationToken ct)
    {
        if (!ApiEnum.TryParse(status, out RestaurantServiceStatus target)) throw ApiException.Validation("无效服务状态。");
        var suspending = target == RestaurantServiceStatus.Suspended;
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        // UPDATE waits for the restaurant SHARE locks taken by opening, joining and ordering.
        var restaurant = await RowLocks.RestaurantAsync(db, id, RowLock.Update, ct)
            ?? throw AdministrationErrors.RestaurantNotFound();
        await db.Restaurants.Where(r => r.Id == id).ExecuteUpdateAsync(update =>
        {
            update.SetProperty(r => r.ServiceStatus, target);
            // Suspending also stops ordering; restoring ACTIVE leaves ordering off until the store enables it.
            if (suspending) update.SetProperty(r => r.OrderingEnabled, false);
        }, ct);
        await transaction.CommitAsync(ct);
        restaurant.ServiceStatus = target;
        if (suspending) restaurant.OrderingEnabled = false;
        logger.LogInformation("Platform {ActorId} set restaurant {RestaurantId} service to {ServiceStatus}.", actor, id, status);
        return RestaurantSummary.From(restaurant);
    }

    public async Task<ManagedAccount> StaffAsync(Guid restaurantId, CancellationToken ct) => ManagedAccount.From(
        await db.RestaurantUsers.AsNoTracking().SingleOrDefaultAsync(u => u.RestaurantId == restaurantId && u.Role == RestaurantUserRole.Staff, ct)
            ?? throw AdministrationErrors.AccountNotFound());

    public async Task<TemporaryAccount> ResetAsync(Guid restaurantId, Guid userId, int version, string actor, CancellationToken ct)
    {
        var user = await FindAsync(restaurantId, userId, ct);
        if (user.CredentialVersion != version || version == int.MaxValue) throw AdministrationErrors.AccountChanged();
        var password = NewPassword();
        var hash = hasher.HashPassword(user, password);
        var count = await db.RestaurantUsers.Where(u => u.RestaurantId == restaurantId && u.Id == userId && u.CredentialVersion == version)
            .ExecuteUpdateAsync(update => update.SetProperty(u => u.PasswordHash, hash).SetProperty(u => u.MustChangePassword, true)
                .SetProperty(u => u.CredentialVersion, u => u.CredentialVersion + 1), ct);
        if (count != 1) throw AdministrationErrors.AccountChanged();
        user.PasswordHash = hash; user.MustChangePassword = true; user.CredentialVersion++;
        logger.LogInformation("{Actor} reset account {AccountId} in restaurant {RestaurantId}.", actor, userId, restaurantId);
        return new(ManagedAccount.From(user), password);
    }

    public async Task<ManagedAccount> SetActiveAsync(Guid restaurantId, Guid userId, int version, bool active, Guid actor, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var user = await db.RestaurantUsers.FromSql($"SELECT * FROM restaurant_users WHERE restaurant_id = {restaurantId} AND id = {userId} FOR UPDATE")
            .SingleOrDefaultAsync(ct) ?? throw AdministrationErrors.AccountNotFound();
        if (user.CredentialVersion != version || version == int.MaxValue) throw AdministrationErrors.AccountChanged();
        if (user.IsActive != active)
        {
            user.IsActive = active; user.CredentialVersion++;
            await db.SaveChangesAsync(ct);
        }
        await transaction.CommitAsync(ct);
        logger.LogInformation("Platform {ActorId} set account {AccountId} active={Active}.", actor, userId, active);
        return ManagedAccount.From(user);
    }

    private async Task<RestaurantUser> FindAsync(Guid restaurantId, Guid userId, CancellationToken ct) =>
        await db.RestaurantUsers.AsNoTracking().SingleOrDefaultAsync(u => u.Id == userId && u.RestaurantId == restaurantId, ct)
            ?? throw AdministrationErrors.AccountNotFound();

    private static string NewPassword() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(18))
        .Replace('+', '-').Replace('/', '_');
}
