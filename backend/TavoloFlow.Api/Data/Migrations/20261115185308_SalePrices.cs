using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SalePrices : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "sale_price_cents",
                table: "menu_items",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_item_sale_price",
                table: "menu_items",
                sql: "sale_price_cents IS NULL OR (sale_price_cents > 0 AND sale_price_cents < price_cents)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_item_sale_price",
                table: "menu_items");

            migrationBuilder.DropColumn(
                name: "sale_price_cents",
                table: "menu_items");
        }
    }
}
