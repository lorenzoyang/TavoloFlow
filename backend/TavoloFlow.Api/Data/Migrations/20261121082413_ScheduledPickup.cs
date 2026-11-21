using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ScheduledPickup : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "pickup_min_notice_minutes",
                table: "restaurants",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "kitchen_starts_at",
                table: "orders",
                type: "timestamptz",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "requested_pickup_at",
                table: "online_requests",
                type: "timestamptz",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "kitchen_queue_at",
                table: "orders",
                type: "timestamptz",
                nullable: false,
                computedColumnSql: "COALESCE(kitchen_starts_at, created_at)",
                stored: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_restaurant_pickup_notice",
                table: "restaurants",
                sql: "pickup_min_notice_minutes IN (30, 45, 60, 90, 120)");

            migrationBuilder.CreateIndex(
                name: "IX_orders_restaurant_id_status_kitchen_queue_at_id",
                table: "orders",
                columns: new[] { "restaurant_id", "status", "kitchen_queue_at", "id" },
                filter: "kitchen_starts_at IS NULL OR processed_at IS NULL OR processed_at >= kitchen_queue_at");

            migrationBuilder.AddCheckConstraint(
                name: "ck_order_kitchen_start",
                table: "orders",
                sql: "kitchen_starts_at >= created_at");

            migrationBuilder.AddCheckConstraint(
                name: "ck_online_request_pickup_time",
                table: "online_requests",
                sql: "requested_pickup_at IS NULL OR (fulfillment = 'PICKUP' AND requested_pickup_at > submitted_at AND (estimated_at IS NULL OR estimated_at = requested_pickup_at))");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_restaurant_pickup_notice",
                table: "restaurants");

            migrationBuilder.DropIndex(
                name: "IX_orders_restaurant_id_status_kitchen_queue_at_id",
                table: "orders");

            migrationBuilder.DropCheckConstraint(
                name: "ck_order_kitchen_start",
                table: "orders");

            migrationBuilder.DropCheckConstraint(
                name: "ck_online_request_pickup_time",
                table: "online_requests");

            migrationBuilder.DropColumn(
                name: "kitchen_queue_at",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "pickup_min_notice_minutes",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "kitchen_starts_at",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "requested_pickup_at",
                table: "online_requests");
        }
    }
}
