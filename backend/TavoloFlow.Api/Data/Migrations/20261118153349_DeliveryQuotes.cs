using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class DeliveryQuotes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "delivery_distance_meters",
                table: "online_requests",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "delivery_fee_cents",
                table: "online_requests",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_online_request_delivery_quote",
                table: "online_requests",
                sql: "(delivery_fee_cents IS NULL AND delivery_distance_meters IS NULL) OR (delivery_fee_cents IS NOT NULL AND delivery_distance_meters IS NOT NULL AND fulfillment = 'DELIVERY' AND delivery_fee_cents BETWEEN 0 AND 9007199254740991 AND delivery_distance_meters BETWEEN 1 AND 30000)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_online_request_delivery_quote",
                table: "online_requests");

            migrationBuilder.DropColumn(
                name: "delivery_distance_meters",
                table: "online_requests");

            migrationBuilder.DropColumn(
                name: "delivery_fee_cents",
                table: "online_requests");
        }
    }
}
