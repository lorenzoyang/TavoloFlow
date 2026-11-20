using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class DeliveryFreeMinimum : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "free_delivery_min_cents",
                table: "delivery_tiers",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_delivery_tier_free_delivery_min",
                table: "delivery_tiers",
                sql: "free_delivery_min_cents BETWEEN 1 AND 9007199254740991");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_delivery_tier_free_delivery_min",
                table: "delivery_tiers");

            migrationBuilder.DropColumn(
                name: "free_delivery_min_cents",
                table: "delivery_tiers");
        }
    }
}
