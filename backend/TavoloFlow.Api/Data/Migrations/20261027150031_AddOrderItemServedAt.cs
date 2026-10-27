using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderItemServedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "served_at",
                table: "order_items",
                type: "timestamptz",
                nullable: true);

            // Items made ready before the pass screen existed were delivered without it; do not queue them.
            migrationBuilder.Sql("UPDATE order_items SET served_at = ready_at WHERE status = 'READY';");

            migrationBuilder.CreateIndex(
                name: "IX_order_items_restaurant_id_ready_at_id",
                table: "order_items",
                columns: new[] { "restaurant_id", "ready_at", "id" },
                filter: "status = 'READY' AND served_at IS NULL");

            migrationBuilder.AddCheckConstraint(
                name: "ck_order_item_served",
                table: "order_items",
                sql: "served_at IS NULL OR (status = 'READY' AND served_at >= ready_at)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_order_items_restaurant_id_ready_at_id",
                table: "order_items");

            migrationBuilder.DropCheckConstraint(
                name: "ck_order_item_served",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "served_at",
                table: "order_items");
        }
    }
}
