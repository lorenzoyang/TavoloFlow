using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class DeliveryTiers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "delivery_origin_lat",
                table: "restaurants",
                type: "numeric(8,6)",
                precision: 8,
                scale: 6,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "delivery_origin_lng",
                table: "restaurants",
                type: "numeric(9,6)",
                precision: 9,
                scale: 6,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "delivery_tiers",
                columns: table => new
                {
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    max_meters = table.Column<int>(type: "integer", nullable: false),
                    fee_cents = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_delivery_tiers", x => new { x.restaurant_id, x.max_meters });
                    table.CheckConstraint("ck_delivery_tier_distance", "max_meters BETWEEN 1 AND 30000");
                    table.CheckConstraint("ck_delivery_tier_fee", "fee_cents BETWEEN 0 AND 9007199254740991");
                    table.ForeignKey(
                        name: "FK_delivery_tiers_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.AddCheckConstraint(
                name: "ck_restaurant_delivery_origin",
                table: "restaurants",
                sql: "(delivery_origin_lat IS NULL AND delivery_origin_lng IS NULL) OR (delivery_origin_lat IS NOT NULL AND delivery_origin_lng IS NOT NULL AND delivery_origin_lat BETWEEN -90 AND 90 AND delivery_origin_lng BETWEEN -180 AND 180)");

            // Delivery now needs coordinates and fee bands, which no restaurant has yet: switch it off
            // (no restaurant used delivery) until its owner sets them up. Notes and minimums stay.
            migrationBuilder.Sql(
                "UPDATE restaurants SET delivery_enabled = false WHERE delivery_enabled;"
            );

            migrationBuilder.AddCheckConstraint(
                name: "ck_restaurant_delivery_ready",
                table: "restaurants",
                sql: "NOT delivery_enabled OR delivery_origin_lat IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "delivery_tiers");

            migrationBuilder.DropCheckConstraint(
                name: "ck_restaurant_delivery_origin",
                table: "restaurants");

            migrationBuilder.DropCheckConstraint(
                name: "ck_restaurant_delivery_ready",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "delivery_origin_lat",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "delivery_origin_lng",
                table: "restaurants");
        }
    }
}
