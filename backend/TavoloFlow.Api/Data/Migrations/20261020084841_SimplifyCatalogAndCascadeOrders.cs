using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SimplifyCatalogAndCascadeOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $catalog_checks$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM restaurant_tables
                        GROUP BY restaurant_id, table_label HAVING count(*) > 1
                    ) THEN
                        RAISE EXCEPTION USING
                            ERRCODE = '23505',
                            MESSAGE = 'Cannot apply SimplifyCatalogAndCascadeOrders: duplicate restaurant table labels exist.',
                            HINT = 'Resolve duplicate labels, including soft-deleted rows, before retrying the migration.';
                    END IF;
                    IF EXISTS (
                        SELECT 1 FROM menu_items WHERE item_code IS NOT NULL
                        GROUP BY restaurant_id, item_code HAVING count(*) > 1
                    ) THEN
                        RAISE EXCEPTION USING
                            ERRCODE = '23505',
                            MESSAGE = 'Cannot apply SimplifyCatalogAndCascadeOrders: duplicate menu item codes exist.',
                            HINT = 'Resolve duplicate non-null codes, including soft-deleted rows, before retrying the migration.';
                    END IF;
                END;
                $catalog_checks$;
                """);

            migrationBuilder.DropForeignKey(
                name: "FK_order_items_orders_order_id_restaurant_id",
                table: "order_items");

            migrationBuilder.DropForeignKey(
                name: "FK_orders_dining_sessions_dining_session_id_restaurant_id",
                table: "orders");

            migrationBuilder.DropForeignKey(
                name: "FK_orders_restaurant_users_cancelled_by_user_id_restaurant_id",
                table: "orders");

            migrationBuilder.DropIndex(
                name: "uq_tables_active_label",
                table: "restaurant_tables");

            migrationBuilder.DropIndex(
                name: "IX_orders_cancelled_by_user_id_restaurant_id",
                table: "orders");

            migrationBuilder.DropCheckConstraint(
                name: "ck_order_lifecycle",
                table: "orders");

            migrationBuilder.DropIndex(
                name: "uq_menu_items_active_code",
                table: "menu_items");

            migrationBuilder.DropColumn(
                name: "created_at",
                table: "restaurant_tables");

            migrationBuilder.DropColumn(
                name: "deleted_at",
                table: "restaurant_tables");

            migrationBuilder.DropColumn(
                name: "cancelled_by_user_id",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "created_at",
                table: "menu_items");

            migrationBuilder.DropColumn(
                name: "deleted_at",
                table: "menu_items");

            migrationBuilder.DropColumn(
                name: "created_at",
                table: "menu_categories");

            migrationBuilder.DropColumn(
                name: "deleted_at",
                table: "menu_categories");

            migrationBuilder.AlterColumn<Guid>(
                name: "menu_item_id",
                table: "order_items",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AlterColumn<Guid>(
                name: "table_id",
                table: "dining_sessions",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.CreateIndex(
                name: "uq_tables_label",
                table: "restaurant_tables",
                columns: new[] { "restaurant_id", "table_label" },
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_order_lifecycle",
                table: "orders",
                sql: "(status = 'NEW' AND ready_at IS NULL AND cancelled_at IS NULL AND cancel_reason IS NULL) OR (status = 'READY' AND ready_at IS NOT NULL AND cancelled_at IS NULL AND cancel_reason IS NULL) OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL AND cancel_reason ~ '[^[:space:]]')");

            migrationBuilder.CreateIndex(
                name: "uq_menu_items_code",
                table: "menu_items",
                columns: new[] { "restaurant_id", "item_code" },
                unique: true,
                filter: "item_code IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "ck_session_active_table",
                table: "dining_sessions",
                sql: "status <> 'ACTIVE' OR table_id IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_order_items_orders_order_id_restaurant_id",
                table: "order_items",
                columns: new[] { "order_id", "restaurant_id" },
                principalTable: "orders",
                principalColumns: new[] { "id", "restaurant_id" },
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_orders_dining_sessions_dining_session_id_restaurant_id",
                table: "orders",
                columns: new[] { "dining_session_id", "restaurant_id" },
                principalTable: "dining_sessions",
                principalColumns: new[] { "id", "restaurant_id" },
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            throw new NotSupportedException(
                "SimplifyCatalogAndCascadeOrders cannot be downgraded because removed timestamps, deletion markers, " +
                "cancellation attribution, and deleted historical links cannot be reconstructed. Restore a database backup to recover them.");
        }
    }
}
