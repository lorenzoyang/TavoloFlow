using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class DeliveryMinOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "delivery_min_order_cents",
                table: "restaurants",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_restaurant_delivery_min_order",
                table: "restaurants",
                sql: "delivery_min_order_cents IS NULL OR delivery_min_order_cents BETWEEN 1 AND 9007199254740991");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_restaurant_delivery_min_order",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "delivery_min_order_cents",
                table: "restaurants");
        }
    }
}
