using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddOnlineSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "online_paused_until",
                table: "restaurants",
                type: "timestamptz",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "public_phone",
                table: "restaurants",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "online_hours",
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
                    table.PrimaryKey("PK_online_hours", x => new { x.restaurant_id, x.weekday, x.slot });
                    table.CheckConstraint("ck_online_hour_minutes", "opens_minute >= 0 AND opens_minute < closes_minute AND closes_minute <= 1440");
                    table.CheckConstraint("ck_online_hour_slot", "slot IN (1, 2)");
                    table.CheckConstraint("ck_online_hour_weekday", "weekday BETWEEN 1 AND 7");
                    table.ForeignKey(
                        name: "FK_online_hours_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.AddCheckConstraint(
                name: "ck_restaurant_public_phone",
                table: "restaurants",
                sql: "public_phone IS NULL OR public_phone ~ '^\\+?[0-9]{6,15}$'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "online_hours");

            migrationBuilder.DropCheckConstraint(
                name: "ck_restaurant_public_phone",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "online_paused_until",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "public_phone",
                table: "restaurants");
        }
    }
}
