using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class PickupReservationRange : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "pickup_max_days_ahead",
                table: "restaurants",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddCheckConstraint(
                name: "ck_restaurant_pickup_days_ahead",
                table: "restaurants",
                sql: "pickup_max_days_ahead IN (1, 7)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_restaurant_pickup_days_ahead",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "pickup_max_days_ahead",
                table: "restaurants");
        }
    }
}
