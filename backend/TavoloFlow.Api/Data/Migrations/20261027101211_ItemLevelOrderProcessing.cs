using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ItemLevelOrderProcessing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_orders_restaurant_id_status_created_at",
                table: "orders");

            migrationBuilder.DropCheckConstraint(
                name: "ck_order_lifecycle",
                table: "orders");

            migrationBuilder.DropCheckConstraint(
                name: "ck_order_status",
                table: "orders");

            migrationBuilder.DropCheckConstraint(
                name: "ck_order_transition_times",
                table: "orders");

            migrationBuilder.AddColumn<DateTime>(
                name: "processed_at",
                table: "orders",
                type: "timestamptz",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "cancelled_at",
                table: "order_items",
                type: "timestamptz",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ready_at",
                table: "order_items",
                type: "timestamptz",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "status",
                table: "order_items",
                type: "character varying(12)",
                maxLength: 12,
                nullable: false,
                defaultValue: "NEW");

            // Preserve all existing snapshots and legacy whole-order cancellation reasons.
            // These copied timestamps describe the old whole-order event, not individual preparation.
            migrationBuilder.Sql("""
                UPDATE order_items AS i
                SET status = o.status, ready_at = o.ready_at, cancelled_at = o.cancelled_at
                FROM orders AS o
                WHERE i.order_id = o.id AND i.restaurant_id = o.restaurant_id;

                UPDATE orders SET processed_at = COALESCE(cancelled_at, ready_at), status = 'PROCESSED'
                WHERE status IN ('READY', 'CANCELLED');
                """);

            migrationBuilder.DropColumn(name: "ready_at", table: "orders");
            migrationBuilder.DropColumn(name: "cancelled_at", table: "orders");

            migrationBuilder.CreateIndex(
                name: "IX_orders_restaurant_id_status_created_at_id",
                table: "orders",
                columns: new[] { "restaurant_id", "status", "created_at", "id" });

            migrationBuilder.CreateIndex(
                name: "IX_orders_restaurant_id_status_processed_at_id",
                table: "orders",
                columns: new[] { "restaurant_id", "status", "processed_at", "id" });

            migrationBuilder.AddCheckConstraint(
                name: "ck_order_lifecycle",
                table: "orders",
                sql: "(status = 'NEW' AND processed_at IS NULL) OR (status = 'PROCESSED' AND processed_at IS NOT NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_order_status",
                table: "orders",
                sql: "status IN ('NEW', 'PROCESSED')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_order_transition_times",
                table: "orders",
                sql: "processed_at IS NULL OR processed_at >= created_at");

            migrationBuilder.AddCheckConstraint(
                name: "ck_order_item_lifecycle",
                table: "order_items",
                sql: "(status = 'NEW' AND ready_at IS NULL AND cancelled_at IS NULL) OR (status = 'READY' AND ready_at IS NOT NULL AND cancelled_at IS NULL) OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND (ready_at IS NULL OR cancelled_at >= ready_at))");

            migrationBuilder.AddCheckConstraint(
                name: "ck_order_item_status",
                table: "order_items",
                sql: "status IN ('NEW', 'READY', 'CANCELLED')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Mixed item states and reason-free cancellations cannot be represented by the old model.
            throw new NotSupportedException("Restore the pre-upgrade backup to roll back item-level order processing.");
        }
    }
}
