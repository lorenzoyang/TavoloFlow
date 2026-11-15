using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddRestaurantServices : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "dine_in_enabled",
                table: "restaurants",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "online_enabled",
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

            migrationBuilder.CreateIndex(
                name: "uq_restaurant_slug",
                table: "restaurants",
                column: "slug",
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_restaurant_online_slug",
                table: "restaurants",
                sql: "NOT online_enabled OR slug IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "ck_restaurant_services",
                table: "restaurants",
                sql: "dine_in_enabled OR online_enabled");

            migrationBuilder.AddCheckConstraint(
                name: "ck_restaurant_slug",
                table: "restaurants",
                sql: "slug IS NULL OR slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "uq_restaurant_slug",
                table: "restaurants");

            migrationBuilder.DropCheckConstraint(
                name: "ck_restaurant_online_slug",
                table: "restaurants");

            migrationBuilder.DropCheckConstraint(
                name: "ck_restaurant_services",
                table: "restaurants");

            migrationBuilder.DropCheckConstraint(
                name: "ck_restaurant_slug",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "dine_in_enabled",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "online_enabled",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "slug",
                table: "restaurants");
        }
    }
}
