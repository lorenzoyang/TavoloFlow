using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using TavoloFlow.Api.Data;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Tests;

public sealed class ApplicationDbContextTests(PostgreSqlFixture database) : IClassFixture<PostgreSqlFixture>
{
    [Fact]
    public async Task Migrate_RemoveDiningSessionActors_PreservesExistingSessions()
    {
        const string previousMigration = "20261019175449_CascadeRestaurantDeletion";
        await using var context = await database.CreateIsolatedContextAsync();
        var migrator = context.GetService<IMigrator>();
        await migrator.MigrateAsync(previousMigration);

        var restaurantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var tableId = Guid.NewGuid();
        var activeSessionId = Guid.NewGuid();
        var closedSessionId = Guid.NewGuid();
        var username = $"upgrade_{Guid.NewGuid():N}";
        var qrToken = Guid.NewGuid().ToString("N");
        var openedAt = new DateTime(2026, 10, 19, 10, 0, 0, DateTimeKind.Utc);
        var closedAt = openedAt.AddHours(2);

        // The previous schema requires actor IDs. Seed it directly before applying their removal.
        await context.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO restaurants (id, name, default_language)
            VALUES ({restaurantId}, 'Upgrade test', 'it');
            INSERT INTO restaurant_users (id, restaurant_id, username, password_hash, role)
            VALUES ({userId}, {restaurantId}, {username}, 'test-only-hash', 'OWNER');
            INSERT INTO restaurant_tables (id, restaurant_id, table_label, qr_token)
            VALUES ({tableId}, {restaurantId}, '1', {qrToken});
            INSERT INTO dining_sessions
                (id, restaurant_id, table_id, status, join_code_ciphertext, bill_version,
                 table_label_snapshot, opened_by_user_id, opened_at, closed_at,
                 closed_by_user_id, close_reason, closed_total_cents)
            VALUES
                ({activeSessionId}, {restaurantId}, {tableId}, 'ACTIVE', 'test-only-ciphertext',
                 3, 'Original table', {userId}, {openedAt}, NULL, NULL, NULL, NULL),
                ({closedSessionId}, {restaurantId}, {tableId}, 'CLOSED', NULL,
                 7, 'Original table', {userId}, {openedAt}, {closedAt}, {userId}, 'PAID', 2400);
            """);

        var sessions = context.DiningSessions.AsNoTracking().OrderBy(session => session.Id)
            .Select(session => new
            {
                session.Id,
                session.RestaurantId,
                session.TableId,
                session.Status,
                session.JoinCodeCiphertext,
                session.BillVersion,
                session.TableLabelSnapshot,
                session.OpenedAt,
                session.ClosedAt,
                session.CloseReason,
                session.ClosedTotalCents
            });
        var before = await sessions.ToListAsync();
        Assert.Equal(2, before.Count);
        await migrator.MigrateAsync();
        Assert.Equal(before, await sessions.ToListAsync());

        var columns = await context.Database.SqlQueryRaw<string>("""
            SELECT column_name AS "Value" FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'dining_sessions'
            """).ToListAsync();
        Assert.DoesNotContain("opened_by_user_id", columns);
        Assert.DoesNotContain("closed_by_user_id", columns);
        Assert.Empty(await context.Database.GetPendingMigrationsAsync());
        await Assert.ThrowsAsync<NotSupportedException>(() => migrator.MigrateAsync(previousMigration));
    }

    [Fact]
    public async Task Migrate_EmptyDatabase_CreatesSchemaMatchingModel()
    {
        await using var context = database.CreateContext();
        Assert.True(database.InitiallyEmpty);
        Assert.Equal(context.Database.GetMigrations(), await context.Database.GetAppliedMigrationsAsync());
        Assert.Empty(await context.Database.GetPendingMigrationsAsync());
        Assert.False(context.Database.HasPendingModelChanges());

        var tables = await context.Database.SqlQueryRaw<string>(
            "SELECT tablename AS \"Value\" FROM pg_tables WHERE schemaname = 'public' AND tablename <> '__EFMigrationsHistory'")
            .ToListAsync();
        Assert.Equal(
            new[] { "dining_sessions", "menu_categories", "menu_items", "order_items", "orders", "platform_users", "restaurant_subscription_periods", "restaurant_tables", "restaurant_users", "restaurants" },
            tables.Order());
    }

    [Fact]
    public async Task SaveChanges_EntityGraph_RoundTripsDefaultsAndExplicitValues()
    {
        var visit = await SeedVisitAsync(useFalseFlags: true);
        Guid orderId;
        Guid platformUserId;
        await using (var context = database.CreateContext())
        {
            var platformUser = new PlatformUser
            {
                Username = $"admin-{Guid.NewGuid():N}",
                PasswordHash = "test-only-hash",
                IsActive = false
            };
            var order = NewOrder(visit);
            context.AddRange(platformUser, order, NewOrderItem(visit, order));
            await context.SaveChangesAsync();
            orderId = order.Id;
            platformUserId = platformUser.Id;
        }

        await using var read = database.CreateContext();
        var saved = await read.Orders.Include(order => order.Items).ThenInclude(item => item.MenuItem)
            .Include(order => order.DiningSession).ThenInclude(session => session.Table)
            .Include(order => order.Restaurant).SingleAsync(order => order.Id == orderId);
        Assert.Equal(7, saved.Id.Version);
        Assert.Equal(OrderStatus.New, saved.Status);
        Assert.Equal(DiningSessionStatus.Active, saved.DiningSession.Status);
        Assert.Equal(1, saved.DiningSession.BillVersion);
        Assert.Equal(DateTimeKind.Utc, saved.CreatedAt.Kind);
        Assert.Equal(DateTimeKind.Utc, saved.DiningSession.OpenedAt.Kind);
        Assert.True(saved.CreatedAt > DateTime.UnixEpoch);
        Assert.Equal(RestaurantServiceStatus.Active, saved.Restaurant.ServiceStatus);
        Assert.Equal("EUR", saved.Restaurant.CurrencyCode);
        Assert.Equal("Europe/Rome", saved.Restaurant.TimeZone);
        var user = await read.RestaurantUsers.SingleAsync(user => user.Id == visit.UserId);
        Assert.Equal(RestaurantUserRole.Owner, user.Role);
        Assert.Equal(1, user.CredentialVersion);
        Assert.False(user.IsActive);
        Assert.False(user.MustChangePassword);
        Assert.NotNull(saved.DiningSession.Table);
        Assert.False(saved.DiningSession.Table.IsEnabled);
        var line = Assert.Single(saved.Items);
        Assert.NotNull(line.MenuItem);
        Assert.Equal(new[] { "GLUTEN", "SOY" }, line.AllergenCodesSnapshot);
        Assert.Equal(line.AllergenCodesSnapshot, line.MenuItem.AllergenCodes);
        Assert.False(line.MenuItem.IsAvailable);
        Assert.False(line.MenuItem.AllergenReviewed);
        Assert.False((await read.PlatformUsers.SingleAsync(user => user.Id == platformUserId)).IsActive);
        Assert.Equal("ACTIVE", await read.Database.SqlQuery<string>(
            $"SELECT service_status AS \"Value\" FROM restaurants WHERE id = {visit.RestaurantId}").SingleAsync());
    }

    [Theory]
    [InlineData("menu_category")]
    [InlineData("session_table")]
    [InlineData("order_session")]
    [InlineData("line_order")]
    [InlineData("line_menu_item")]
    public async Task Update_CrossRestaurantReference_RejectsForeignKey(string relationship)
    {
        var first = await SeedVisitAsync();
        var second = await SeedVisitAsync();
        if (relationship == "session_table")
        {
            // Remove the target table's active-session collision to isolate the tenant FK.
            await CloseSessionAsync(second);
        }
        await using var context = database.CreateContext();
        var firstOrder = NewOrder(first);
        var secondOrder = NewOrder(second);
        var line = NewOrderItem(first, firstOrder);
        context.AddRange(firstOrder, secondOrder, line);
        await context.SaveChangesAsync();

        // Raw updates deliberately bypass relationship fixup so the database must enforce isolation.
        FormattableString sql = relationship switch
        {
            "menu_category" => $"UPDATE menu_items SET category_id = {second.CategoryId} WHERE id = {first.MenuItemId}",
            "session_table" => $"UPDATE dining_sessions SET table_id = {second.TableId} WHERE id = {first.SessionId}",
            "order_session" => $"UPDATE orders SET dining_session_id = {second.SessionId} WHERE id = {firstOrder.Id}",
            "line_order" => $"UPDATE order_items SET order_id = {secondOrder.Id} WHERE id = {line.Id}",
            "line_menu_item" => $"UPDATE order_items SET menu_item_id = {second.MenuItemId} WHERE id = {line.Id}",
            _ => throw new ArgumentOutOfRangeException(nameof(relationship))
        };
        var error = await Assert.ThrowsAsync<PostgresException>(() => context.Database.ExecuteSqlInterpolatedAsync(sql));
        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, error.SqlState);
    }

    [Fact]
    public async Task SaveChanges_ConcurrentActiveSessions_AllowsOneAndPermitsReopeningAfterClose()
    {
        var visit = await SeedVisitAsync();
        await CloseSessionAsync(visit);

        async Task<bool> TryOpenAsync()
        {
            await using var context = database.CreateContext();
            context.Add(NewSession(visit));
            return await TrySaveUniqueAsync(context, "uq_active_session_per_table");
        }

        var results = await Task.WhenAll(TryOpenAsync(), TryOpenAsync());
        Assert.Single(results, success => success);
        await using var read = database.CreateContext();
        Assert.Equal(1, await read.DiningSessions.CountAsync(session => session.TableId == visit.TableId && session.Status == DiningSessionStatus.Active));
        Assert.Equal(1, await read.DiningSessions.CountAsync(session => session.TableId == visit.TableId && session.Status == DiningSessionStatus.Closed));
    }

    [Fact]
    public async Task SaveChanges_ConcurrentDuplicateRequest_PersistsOneOrderPerSession()
    {
        var first = await SeedVisitAsync();
        var requestId = Guid.NewGuid();

        async Task<bool> TryOrderAsync()
        {
            await using var context = database.CreateContext();
            var order = NewOrder(first, requestId);
            context.AddRange(order, NewOrderItem(first, order));
            return await TrySaveUniqueAsync(context, "uq_order_one_per_request");
        }

        var results = await Task.WhenAll(TryOrderAsync(), TryOrderAsync());
        Assert.Single(results, success => success);
        await using var read = database.CreateContext();
        var saved = await read.Orders.Include(order => order.Items)
            .SingleAsync(order => order.DiningSessionId == first.SessionId && order.ClientRequestId == requestId);
        Assert.Single(saved.Items);

        var second = await SeedVisitAsync();
        read.Add(NewOrder(second, requestId));
        await read.SaveChangesAsync();
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task SaveChanges_DuplicateLabelOrCode_AllowsReuseOnlyAfterDeletion(bool tableLabel)
    {
        var visit = await SeedVisitAsync();
        await using var context = database.CreateContext();
        object replacement = tableLabel
            ? new RestaurantTable { RestaurantId = visit.RestaurantId, TableLabel = "1", QrToken = Guid.NewGuid().ToString("N") }
            : new MenuItem { RestaurantId = visit.RestaurantId, CategoryId = visit.CategoryId, ItemCode = "D1", NameEn = "New dish", PriceCents = 1500 };
        context.Add(replacement);
        Assert.False(await TrySaveUniqueAsync(context, tableLabel ? "uq_tables_label" : "uq_menu_items_code"));
        context.ChangeTracker.Clear();

        if (tableLabel)
        {
            await CloseSessionAsync(visit);
        }

        var service = new CatalogDeletionService(context);
        var result = tableLabel
            ? await service.DeleteRestaurantTableAsync(visit.RestaurantId, visit.TableId)
            : await service.DeleteMenuItemAsync(visit.RestaurantId, visit.MenuItemId);
        Assert.Equal(CatalogDeletionResult.Deleted, result);
        context.Add(replacement);
        await context.SaveChangesAsync();
    }

    [Theory]
    [InlineData("platform_username")]
    [InlineData("restaurant_username")]
    [InlineData("restaurant_role")]
    [InlineData("qr_token")]
    public async Task SaveChanges_DuplicateAccountOrQr_RejectsUniqueViolation(string key)
    {
        var first = await SeedVisitAsync();
        var second = await SeedVisitAsync();
        await using var context = database.CreateContext();
        var user = await context.RestaurantUsers.AsNoTracking().SingleAsync(user => user.Id == first.UserId);
        var table = await context.RestaurantTables.AsNoTracking().SingleAsync(table => table.Id == first.TableId);
        var username = $"admin-{Guid.NewGuid():N}";
        object duplicate;
        if (key == "platform_username")
        {
            context.Add(new PlatformUser { Username = username, PasswordHash = "test-only-hash" });
            await context.SaveChangesAsync();
            duplicate = new PlatformUser { Username = username, PasswordHash = "test-only-hash" };
        }
        else
        {
            duplicate = key switch
            {
                "restaurant_username" => new RestaurantUser { RestaurantId = second.RestaurantId, Username = user.Username, PasswordHash = "test-only-hash", Role = RestaurantUserRole.Staff },
                "restaurant_role" => new RestaurantUser { RestaurantId = first.RestaurantId, Username = Guid.NewGuid().ToString("N"), PasswordHash = "test-only-hash", Role = RestaurantUserRole.Owner },
                "qr_token" => new RestaurantTable { RestaurantId = second.RestaurantId, TableLabel = "2", QrToken = table.QrToken },
                _ => throw new ArgumentOutOfRangeException(nameof(key))
            };
        }

        context.Add(duplicate);
        var error = await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
        Assert.Equal(PostgresErrorCodes.UniqueViolation, Assert.IsType<PostgresException>(error.InnerException).SqlState);
    }

    [Theory]
    [InlineData("blank_category", "ck_category_has_name")]
    [InlineData("zero_price", "ck_item_positive_price")]
    [InlineData("zero_quantity", "ck_order_item_quantity")]
    [InlineData("zero_credential_version", "ck_restaurant_user_credential_version")]
    [InlineData("mixed_case_username", "ck_restaurant_user_username")]
    [InlineData("closed_without_reason", "ck_session_lifecycle")]
    [InlineData("closed_before_open", "ck_session_close_time")]
    [InlineData("active_without_table", "ck_session_active_table")]
    [InlineData("ready_without_timestamp", "ck_order_lifecycle")]
    [InlineData("cancelled_without_reason", "ck_order_lifecycle")]
    [InlineData("cancelled_with_blank_reason", "ck_order_lifecycle")]
    [InlineData("ready_before_creation", "ck_order_transition_times")]
    public async Task Update_InvalidRecord_RejectsCheckConstraint(string scenario, string constraint)
    {
        var visit = await SeedVisitAsync();
        await using var context = database.CreateContext();
        var order = NewOrder(visit);
        var line = NewOrderItem(visit, order);
        context.AddRange(order, line);
        await context.SaveChangesAsync();
        FormattableString sql = scenario switch
        {
            "blank_category" => $"UPDATE menu_categories SET name_en = E' \\t\\n' WHERE id = {visit.CategoryId}",
            "zero_price" => $"UPDATE menu_items SET price_cents = 0 WHERE id = {visit.MenuItemId}",
            "zero_quantity" => $"UPDATE order_items SET quantity = 0 WHERE id = {line.Id}",
            "zero_credential_version" => $"UPDATE restaurant_users SET credential_version = 0 WHERE id = {visit.UserId}",
            "mixed_case_username" => $"UPDATE restaurant_users SET username = 'MixedCase' WHERE id = {visit.UserId}",
            "closed_without_reason" => $"UPDATE dining_sessions SET status = 'CLOSED', closed_at = now(), closed_total_cents = 0, join_code_ciphertext = NULL WHERE id = {visit.SessionId}",
            "closed_before_open" => $"UPDATE dining_sessions SET status = 'CLOSED', closed_at = opened_at - interval '1 second', close_reason = 'EMPTY', closed_total_cents = 0, join_code_ciphertext = NULL WHERE id = {visit.SessionId}",
            "active_without_table" => $"UPDATE dining_sessions SET table_id = NULL WHERE id = {visit.SessionId}",
            "ready_without_timestamp" => $"UPDATE orders SET status = 'READY' WHERE id = {order.Id}",
            "cancelled_without_reason" => $"UPDATE orders SET status = 'CANCELLED', cancelled_at = now() WHERE id = {order.Id}",
            "cancelled_with_blank_reason" => $"UPDATE orders SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = E' \\t' WHERE id = {order.Id}",
            "ready_before_creation" => $"UPDATE orders SET status = 'READY', ready_at = created_at - interval '1 second' WHERE id = {order.Id}",
            _ => throw new ArgumentOutOfRangeException(nameof(scenario))
        };
        var error = await Assert.ThrowsAsync<PostgresException>(() => context.Database.ExecuteSqlInterpolatedAsync(sql));
        Assert.Equal(PostgresErrorCodes.CheckViolation, error.SqlState);
        Assert.Equal(constraint, error.ConstraintName);
    }

    [Fact]
    public async Task DeleteCatalog_ReferencedRows_PreservesHistoryAndTenantOwnership()
    {
        var visit = await SeedVisitAsync();
        Guid orderId;
        await using (var context = database.CreateContext())
        {
            var order = NewOrder(visit);
            context.AddRange(order, NewOrderItem(visit, order));
            await context.SaveChangesAsync();
            orderId = order.Id;
        }

        await CloseSessionAsync(visit);
        await using var edit = database.CreateContext();
        var menuItem = await edit.MenuItems.SingleAsync(item => item.Id == visit.MenuItemId);
        menuItem.NameEn = "Renamed dish";
        menuItem.PriceCents = 9999;
        menuItem.AllergenCodes = [];
        var table = await edit.RestaurantTables.SingleAsync(table => table.Id == visit.TableId);
        table.TableLabel = "Renamed table";
        await edit.SaveChangesAsync();

        await using (var direct = database.CreateContext())
        {
            var menuError = await Assert.ThrowsAsync<PostgresException>(() => direct.MenuItems.Where(item => item.Id == visit.MenuItemId).ExecuteDeleteAsync());
            var tableError = await Assert.ThrowsAsync<PostgresException>(() => direct.RestaurantTables.Where(table => table.Id == visit.TableId).ExecuteDeleteAsync());
            var categoryError = await Assert.ThrowsAsync<PostgresException>(() => direct.MenuCategories.Where(category => category.Id == visit.CategoryId).ExecuteDeleteAsync());
            Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, menuError.SqlState);
            Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, tableError.SqlState);
            Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, categoryError.SqlState);
        }

        await using (var deletion = database.CreateContext())
        {
            var service = new CatalogDeletionService(deletion);
            Assert.Equal(CatalogDeletionResult.Deleted, await service.DeleteMenuItemAsync(visit.RestaurantId, visit.MenuItemId));
            Assert.Equal(CatalogDeletionResult.Deleted, await service.DeleteRestaurantTableAsync(visit.RestaurantId, visit.TableId));
            Assert.Equal(1, await deletion.MenuCategories.Where(category => category.Id == visit.CategoryId).ExecuteDeleteAsync());
        }

        await using var read = database.CreateContext();
        var historical = await read.Orders.AsNoTracking()
            .Include(order => order.Items).ThenInclude(item => item.MenuItem)
            .Include(order => order.DiningSession).ThenInclude(session => session.Table)
            .SingleAsync(order => order.Id == orderId);
        var savedLine = Assert.Single(historical.Items);
        Assert.Equal("Dumplings", savedLine.NameEnSnapshot);
        Assert.Equal(1200, savedLine.UnitPriceCents);
        Assert.Equal(new[] { "GLUTEN", "SOY" }, savedLine.AllergenCodesSnapshot);
        Assert.Equal("1", historical.DiningSession.TableLabelSnapshot);
        Assert.Equal(DiningSessionStatus.Closed, historical.DiningSession.Status);
        Assert.Equal(SessionCloseReason.Paid, historical.DiningSession.CloseReason);
        Assert.Null(historical.DiningSession.JoinCodeCiphertext);
        Assert.Null(historical.DiningSession.TableId);
        Assert.Null(historical.DiningSession.Table);
        Assert.Null(savedLine.MenuItemId);
        Assert.Null(savedLine.MenuItem);
        Assert.Equal(visit.RestaurantId, historical.DiningSession.RestaurantId);
        Assert.Equal(visit.RestaurantId, historical.RestaurantId);
        Assert.Equal(visit.RestaurantId, savedLine.RestaurantId);
        Assert.Equal(2400, historical.TotalAmountCents);
        Assert.Equal(2400, historical.DiningSession.ClosedTotalCents);
        Assert.False(await read.MenuItems.AnyAsync(item => item.Id == visit.MenuItemId));
        Assert.False(await read.RestaurantTables.AnyAsync(table => table.Id == visit.TableId));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ExecuteDelete_Restaurant_RemovesOnlyItsData(bool closed)
    {
        var deleted = await SeedVisitAsync();
        var preserved = await SeedVisitAsync();
        Guid platformUserId;
        await using (var setup = database.CreateContext())
        {
            var platformUser = new PlatformUser
            {
                Username = $"admin-{Guid.NewGuid():N}",
                PasswordHash = "test-only-hash"
            };
            setup.Add(platformUser);
            foreach (var visit in new[] { deleted, preserved })
            {
                var order = NewOrder(visit);
                setup.AddRange(order, NewOrderItem(visit, order), new RestaurantUser
                {
                    RestaurantId = visit.RestaurantId,
                    Username = Guid.NewGuid().ToString("N"),
                    PasswordHash = "test-only-hash",
                    Role = RestaurantUserRole.Staff
                });
            }

            await setup.SaveChangesAsync();
            platformUserId = platformUser.Id;
        }

        if (closed)
        {
            await CloseSessionAsync(deleted);
        }

        // Only the restaurant DELETE is sent; PostgreSQL must remove the entire graph.
        await using var context = database.CreateContext();
        Assert.Equal(1, await context.Restaurants.Where(restaurant => restaurant.Id == deleted.RestaurantId).ExecuteDeleteAsync());
        Assert.False(await context.Restaurants.AnyAsync(restaurant => restaurant.Id == deleted.RestaurantId));
        Assert.Equal(new int[7], await GetRestaurantRowCountsAsync(context, deleted.RestaurantId));
        Assert.True(await context.Restaurants.AnyAsync(restaurant => restaurant.Id == preserved.RestaurantId));
        Assert.Equal(new[] { 2, 1, 1, 1, 1, 1, 1 }, await GetRestaurantRowCountsAsync(context, preserved.RestaurantId));
        Assert.True(await context.PlatformUsers.AnyAsync(user => user.Id == platformUserId));
    }

    [Fact]
    public async Task DeleteRestaurantTable_ActiveSession_RejectsWithoutDetachingHistory()
    {
        var visit = await SeedVisitAsync();
        await CloseSessionAsync(visit);
        await using (var setup = database.CreateContext())
        {
            setup.Add(NewSession(visit));
            await setup.SaveChangesAsync();
        }

        await using var context = database.CreateContext();
        var result = await new CatalogDeletionService(context).DeleteRestaurantTableAsync(visit.RestaurantId, visit.TableId);
        Assert.Equal(CatalogDeletionResult.TableHasActiveSession, result);
        Assert.True(await context.RestaurantTables.AnyAsync(table => table.Id == visit.TableId));
        Assert.Equal(2, await context.DiningSessions.CountAsync(session => session.TableId == visit.TableId));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task SaveChanges_CancelledOrder_PreservesOptionalReadyTimestamp(bool wasReady)
    {
        var visit = await SeedVisitAsync();
        await using var context = database.CreateContext();
        var order = NewOrder(visit);
        context.Add(order);
        await context.SaveChangesAsync();
        if (wasReady)
        {
            order.Status = OrderStatus.Ready;
            order.ReadyAt = DateTime.UtcNow;
            await context.SaveChangesAsync();
        }

        order.Status = OrderStatus.Cancelled;
        order.CancelledAt = DateTime.UtcNow;
        order.CancelReason = "Guest changed their order";
        await context.SaveChangesAsync();
        await context.Entry(order).ReloadAsync();
        Assert.Equal(OrderStatus.Cancelled, order.Status);
        Assert.Equal(wasReady, order.ReadyAt.HasValue);
        Assert.NotNull(order.CancelledAt);
    }

    [Fact]
    public async Task Migrate_SimplifyCatalog_PreservesExistingRecordsAndSnapshots()
    {
        const string previousMigration = "20261019200450_RemoveDiningSessionActors";
        await using var context = await database.CreateIsolatedContextAsync();
        var migrator = context.GetService<IMigrator>();
        await migrator.MigrateAsync(previousMigration);
        var visit = await SeedVisitAsync(context, legacyRestaurant: true);
        var closed = NewSession(visit);
        closed.Status = DiningSessionStatus.Closed;
        closed.OpenedAt = DateTime.UtcNow.AddMinutes(-5);
        closed.ClosedAt = DateTime.UtcNow;
        closed.CloseReason = SessionCloseReason.Voided;
        closed.ClosedTotalCents = 0;
        closed.JoinCodeCiphertext = null;
        context.Add(closed);
        var order = NewOrder(visit);
        order.DiningSessionId = closed.Id;
        context.AddRange(order, NewOrderItem(visit, order));
        await context.SaveChangesAsync();
        // Old deletion markers and cancellation attribution are intentionally removed by this upgrade.
        await context.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE orders SET status = 'CANCELLED', cancelled_at = now(),
                cancelled_by_user_id = {visit.UserId}, cancel_reason = 'Guest changed their order'
                WHERE id = {order.Id};
            UPDATE menu_items SET deleted_at = now() WHERE id = {visit.MenuItemId};
            UPDATE menu_categories SET deleted_at = now() WHERE id = {visit.CategoryId};
            UPDATE restaurant_tables SET deleted_at = now() WHERE id = {visit.TableId};
            """);
        context.ChangeTracker.Clear();
        var before = await context.Orders.AsNoTracking().SingleAsync(saved => saved.Id == order.Id);
        await migrator.MigrateAsync();

        var after = await context.Orders.AsNoTracking().Include(saved => saved.Items)
            .Include(saved => saved.DiningSession).SingleAsync(saved => saved.Id == order.Id);
        Assert.Equal(before.RestaurantId, after.RestaurantId);
        Assert.Equal(before.DiningSessionId, after.DiningSessionId);
        Assert.Equal(before.TotalAmountCents, after.TotalAmountCents);
        Assert.Equal(before.CreatedAt, after.CreatedAt);
        Assert.Equal(before.CancelledAt, after.CancelledAt);
        Assert.Equal(before.CancelReason, after.CancelReason);
        Assert.Equal(OrderStatus.Cancelled, after.Status);
        Assert.Equal(visit.TableId, after.DiningSession.TableId);
        Assert.Equal(DiningSessionStatus.Closed, after.DiningSession.Status);
        var line = Assert.Single(after.Items);
        Assert.Equal(visit.MenuItemId, line.MenuItemId);
        Assert.Equal(visit.RestaurantId, line.RestaurantId);
        Assert.Equal("Dumplings", line.NameEnSnapshot);
        Assert.Equal(1200, line.UnitPriceCents);
        Assert.Equal(new[] { "GLUTEN", "SOY" }, line.AllergenCodesSnapshot);
        Assert.True(await context.DiningSessions.AnyAsync(session => session.Id == visit.SessionId && session.Status == DiningSessionStatus.Active));
        Assert.True(await context.MenuItems.AnyAsync(item => item.Id == visit.MenuItemId && item.ItemCode == "D1" && item.PriceCents == 1200));
        Assert.True(await context.MenuCategories.AnyAsync(category => category.Id == visit.CategoryId));

        var removedColumns = await context.Database.SqlQueryRaw<string>("""
            SELECT table_name || '.' || column_name AS "Value" FROM information_schema.columns
            WHERE table_schema = 'public' AND (
                (table_name IN ('menu_categories', 'menu_items', 'restaurant_tables')
                    AND column_name IN ('created_at', 'deleted_at'))
                OR (table_name = 'orders' AND column_name = 'cancelled_by_user_id'))
            """).ToListAsync();
        Assert.Empty(removedColumns);
        Assert.Empty(await context.Database.GetPendingMigrationsAsync());
        await Assert.ThrowsAsync<NotSupportedException>(() => migrator.MigrateAsync(previousMigration));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Migrate_DuplicateCatalogIdentifiers_FailsBeforeRemovingColumns(bool tableLabel)
    {
        const string previousMigration = "20261019200450_RemoveDiningSessionActors";
        await using var context = await database.CreateIsolatedContextAsync();
        var migrator = context.GetService<IMigrator>();
        await migrator.MigrateAsync(previousMigration);
        var visit = await SeedVisitAsync(context, legacyRestaurant: true);
        if (tableLabel)
        {
            await context.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO restaurant_tables (id, restaurant_id, table_label, qr_token, deleted_at)
                VALUES ({Guid.NewGuid()}, {visit.RestaurantId}, '1', {Guid.NewGuid().ToString("N")}, now())
                """);
        }
        else
        {
            await context.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO menu_items (id, restaurant_id, category_id, item_code, name_en, price_cents, deleted_at)
                VALUES ({Guid.NewGuid()}, {visit.RestaurantId}, {visit.CategoryId}, 'D1', 'Archived dish', 1500, now())
                """);
        }

        var error = await Assert.ThrowsAsync<PostgresException>(() => migrator.MigrateAsync());
        Assert.Equal(PostgresErrorCodes.UniqueViolation, error.SqlState);
        Assert.Contains(tableLabel ? "duplicate restaurant table labels" : "duplicate menu item codes", error.MessageText);
        Assert.Contains("including soft-deleted rows", error.Hint);
        Assert.Equal(previousMigration, (await context.Database.GetAppliedMigrationsAsync()).Last());
        Assert.True(await context.Database.SqlQueryRaw<bool>("""
            SELECT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'restaurant_tables' AND column_name = 'created_at') AS "Value"
            """).SingleAsync());
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, false)]
    [InlineData(true, true)]
    [InlineData(false, true)]
    public async Task Delete_SessionOrOrder_CascadesOnlyItsDescendants(bool sessionRoot, bool tracked)
    {
        var visit = await SeedVisitAsync();
        var other = await SeedVisitAsync();
        var first = NewOrder(visit);
        var sibling = NewOrder(visit);
        var preserved = NewOrder(other);
        await using (var setup = database.CreateContext())
        {
            setup.AddRange(first, NewOrderItem(visit, first), sibling, NewOrderItem(visit, sibling),
                preserved, NewOrderItem(other, preserved));
            await setup.SaveChangesAsync();
        }

        await using (var deletion = database.CreateContext())
        {
            if (tracked)
            {
                if (sessionRoot)
                {
                    deletion.Remove(await deletion.DiningSessions.Include(session => session.Orders).ThenInclude(order => order.Items)
                        .SingleAsync(session => session.Id == visit.SessionId));
                }
                else
                {
                    deletion.Remove(await deletion.Orders.Include(order => order.Items).SingleAsync(order => order.Id == first.Id));
                }

                await deletion.SaveChangesAsync();
            }
            else if (sessionRoot)
            {
                Assert.Equal(1, await deletion.DiningSessions.Where(session => session.Id == visit.SessionId).ExecuteDeleteAsync());
            }
            else
            {
                Assert.Equal(1, await deletion.Orders.Where(order => order.Id == first.Id).ExecuteDeleteAsync());
            }
        }

        await using var read = database.CreateContext();
        Assert.False(await read.Orders.AnyAsync(order => order.Id == first.Id));
        Assert.False(await read.OrderItems.AnyAsync(line => line.OrderId == first.Id));
        Assert.Equal(!sessionRoot, await read.DiningSessions.AnyAsync(session => session.Id == visit.SessionId));
        Assert.Equal(!sessionRoot, await read.Orders.AnyAsync(order => order.Id == sibling.Id));
        Assert.Equal(sessionRoot ? 0 : 1, await read.OrderItems.CountAsync(line => line.OrderId == sibling.Id));
        Assert.True(await read.MenuItems.AnyAsync(item => item.Id == visit.MenuItemId));
        Assert.True(await read.RestaurantTables.AnyAsync(table => table.Id == visit.TableId));
        Assert.True(await read.Orders.AnyAsync(order => order.Id == preserved.Id));
        Assert.Single(await read.OrderItems.Where(line => line.OrderId == preserved.Id).ToListAsync());
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task DeleteCatalog_MissingOrWrongRestaurant_ReturnsNotFoundWithoutChanges(bool table)
    {
        var visit = await SeedVisitAsync();
        var other = await SeedVisitAsync();
        await using var context = database.CreateContext();
        var order = NewOrder(visit);
        context.AddRange(order, NewOrderItem(visit, order));
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();
        var service = new CatalogDeletionService(context);
        var wrongTenant = table
            ? await service.DeleteRestaurantTableAsync(other.RestaurantId, visit.TableId)
            : await service.DeleteMenuItemAsync(other.RestaurantId, visit.MenuItemId);
        var absent = table
            ? await service.DeleteRestaurantTableAsync(visit.RestaurantId, Guid.NewGuid())
            : await service.DeleteMenuItemAsync(visit.RestaurantId, Guid.NewGuid());
        Assert.Equal(CatalogDeletionResult.NotFound, wrongTenant);
        Assert.Equal(CatalogDeletionResult.NotFound, absent);
        Assert.True(await context.MenuItems.AnyAsync(item => item.Id == visit.MenuItemId));
        Assert.True(await context.RestaurantTables.AnyAsync(saved => saved.Id == visit.TableId));
        Assert.True(await context.OrderItems.AnyAsync(line => line.OrderId == order.Id && line.MenuItemId == visit.MenuItemId));
        Assert.True(await context.DiningSessions.AnyAsync(session => session.Id == visit.SessionId && session.TableId == visit.TableId));
    }

    private async Task<VisitData> SeedVisitAsync(bool useFalseFlags = false)
    {
        await using var context = database.CreateContext();
        return await SeedVisitAsync(context, useFalseFlags);
    }

    private static async Task<VisitData> SeedVisitAsync(ApplicationDbContext context, bool useFalseFlags = false, bool legacyRestaurant = false)
    {
        var restaurant = new Restaurant { Name = "Test restaurant", DefaultLanguage = "it", ServiceStatus = RestaurantServiceStatus.Active };
        if (legacyRestaurant)
        {
            // Upgrade fixtures target a schema that predates the current Restaurant fields.
            restaurant.Id = Guid.NewGuid();
            await context.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO restaurants (id, name, default_language, service_status) VALUES ({restaurant.Id}, {restaurant.Name}, {restaurant.DefaultLanguage}, 'ACTIVE')");
            context.Attach(restaurant);
        }
        var user = new RestaurantUser
        {
            Restaurant = restaurant,
            Username = Guid.NewGuid().ToString("N"),
            PasswordHash = "test-only-hash",
            Role = RestaurantUserRole.Owner,
            IsActive = !useFalseFlags,
            MustChangePassword = !useFalseFlags
        };
        var table = new RestaurantTable { Restaurant = restaurant, TableLabel = "1", QrToken = Guid.NewGuid().ToString("N"), IsEnabled = !useFalseFlags };
        var category = new MenuCategory { Restaurant = restaurant, NameEn = "Dishes" };
        var item = new MenuItem
        {
            Restaurant = restaurant,
            Category = category,
            ItemCode = "D1",
            NameEn = "Dumplings",
            PriceCents = 1200,
            AllergenCodes = ["GLUTEN", "SOY"],
            IsAvailable = !useFalseFlags
        };
        var session = new DiningSession
        {
            Restaurant = restaurant,
            Table = table,
            TableLabelSnapshot = table.TableLabel,
            JoinCodeCiphertext = "test-only-ciphertext"
        };
        context.AddRange(user, table, category, item, session);
        await context.SaveChangesAsync();
        return new VisitData(restaurant.Id, user.Id, table.Id, category.Id, item.Id, session.Id);
    }

    private static Order NewOrder(VisitData visit, Guid? requestId = null) => new()
    {
        RestaurantId = visit.RestaurantId,
        DiningSessionId = visit.SessionId,
        ClientRequestId = requestId ?? Guid.NewGuid(),
        TotalAmountCents = 2400,
        DefaultLanguageSnapshot = "it"
    };

    private static OrderItem NewOrderItem(VisitData visit, Order order) => new()
    {
        RestaurantId = visit.RestaurantId,
        Order = order,
        MenuItemId = visit.MenuItemId,
        ItemCodeSnapshot = "D1",
        NameEnSnapshot = "Dumplings",
        AllergenCodesSnapshot = ["GLUTEN", "SOY"],
        UnitPriceCents = 1200,
        Quantity = 2
    };

    private static DiningSession NewSession(VisitData visit) => new()
    {
        RestaurantId = visit.RestaurantId,
        TableId = visit.TableId,
        TableLabelSnapshot = "1",
        JoinCodeCiphertext = "test-only-ciphertext"
    };

    private async Task CloseSessionAsync(VisitData visit)
    {
        await using var context = database.CreateContext();
        var session = await context.DiningSessions.SingleAsync(session => session.Id == visit.SessionId);
        session.Status = DiningSessionStatus.Closed;
        session.ClosedAt = DateTime.UtcNow;
        session.ClosedTotalCents = await context.Orders.Where(order => order.DiningSessionId == session.Id)
            .SumAsync(order => order.TotalAmountCents);
        session.CloseReason = session.ClosedTotalCents > 0 ? SessionCloseReason.Paid : SessionCloseReason.Empty;
        session.JoinCodeCiphertext = null;
        await context.SaveChangesAsync();
    }

    private static async Task<bool> TrySaveUniqueAsync(ApplicationDbContext context, string constraint)
    {
        try
        {
            await context.SaveChangesAsync();
            return true;
        }
        catch (DbUpdateException error) when (error.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } postgres)
        {
            Assert.Equal(constraint, postgres.ConstraintName);
            return false;
        }
    }

    private static async Task<int[]> GetRestaurantRowCountsAsync(ApplicationDbContext context, Guid restaurantId) =>
    [
        await context.RestaurantUsers.CountAsync(user => user.RestaurantId == restaurantId),
        await context.RestaurantTables.CountAsync(table => table.RestaurantId == restaurantId),
        await context.MenuCategories.CountAsync(category => category.RestaurantId == restaurantId),
        await context.MenuItems.CountAsync(item => item.RestaurantId == restaurantId),
        await context.DiningSessions.CountAsync(session => session.RestaurantId == restaurantId),
        await context.Orders.CountAsync(order => order.RestaurantId == restaurantId),
        await context.OrderItems.CountAsync(item => item.RestaurantId == restaurantId)
    ];

    private sealed record VisitData(Guid RestaurantId, Guid UserId, Guid TableId, Guid CategoryId, Guid MenuItemId, Guid SessionId);
}
