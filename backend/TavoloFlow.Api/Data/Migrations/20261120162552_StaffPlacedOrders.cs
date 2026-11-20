using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class StaffPlacedOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "is_staff_placed",
                table: "orders",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "is_staff_placed",
                table: "orders");
        }
    }
}
