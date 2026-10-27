using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddRestaurantTheme : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "theme",
                table: "restaurants",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "TERRACOTTA");

            migrationBuilder.AddCheckConstraint(
                name: "ck_restaurant_theme",
                table: "restaurants",
                sql: "theme IN ('TERRACOTTA', 'LACQUER', 'INDIGO', 'INK', 'TARO')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_restaurant_theme",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "theme",
                table: "restaurants");
        }
    }
}
