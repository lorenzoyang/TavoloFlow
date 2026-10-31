using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class PickupSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "phone",
                table: "restaurants",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "pickup_paused",
                table: "restaurants",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "slug",
                table: "restaurants",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "pickup_hours",
                columns: table => new
                {
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    weekday = table.Column<int>(type: "integer", nullable: false),
                    slot = table.Column<int>(type: "integer", nullable: false),
                    opens_minute = table.Column<int>(type: "integer", nullable: false),
                    closes_minute = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_pickup_hours", x => new { x.restaurant_id, x.weekday, x.slot });
                    table.CheckConstraint("ck_pickup_hour_slot", "slot IN (1, 2)");
                    table.CheckConstraint("ck_pickup_hour_weekday", "weekday BETWEEN 1 AND 7");
                    table.CheckConstraint("ck_pickup_hour_window", "opens_minute >= 0 AND opens_minute < closes_minute AND closes_minute <= 1440");
                    table.ForeignKey(
                        name: "FK_pickup_hours_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "uq_restaurant_slug",
                table: "restaurants",
                column: "slug",
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_restaurant_phone",
                table: "restaurants",
                sql: "phone IS NULL OR phone ~ '^\\+?[0-9]{6,15}$'");

            migrationBuilder.AddCheckConstraint(
                name: "ck_restaurant_pickup_contact",
                table: "restaurants",
                sql: "NOT pickup_enabled OR (phone IS NOT NULL AND slug IS NOT NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_restaurant_slug",
                table: "restaurants",
                sql: "slug IS NULL OR slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "pickup_hours");

            migrationBuilder.DropIndex(
                name: "uq_restaurant_slug",
                table: "restaurants");

            migrationBuilder.DropCheckConstraint(
                name: "ck_restaurant_phone",
                table: "restaurants");

            migrationBuilder.DropCheckConstraint(
                name: "ck_restaurant_pickup_contact",
                table: "restaurants");

            migrationBuilder.DropCheckConstraint(
                name: "ck_restaurant_slug",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "phone",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "pickup_paused",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "slug",
                table: "restaurants");
        }
    }
}
