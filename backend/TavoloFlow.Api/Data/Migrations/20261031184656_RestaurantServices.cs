using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class RestaurantServices : Migration
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
                name: "pickup_enabled",
                table: "restaurants",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddCheckConstraint(
                name: "ck_restaurant_services",
                table: "restaurants",
                sql: "dine_in_enabled OR pickup_enabled");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_restaurant_services",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "dine_in_enabled",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "pickup_enabled",
                table: "restaurants");
        }
    }
}
