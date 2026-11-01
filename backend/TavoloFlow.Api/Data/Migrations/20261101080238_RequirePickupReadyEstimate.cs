using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class RequirePickupReadyEstimate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_pickup_request_acceptance",
                table: "pickup_requests");

            migrationBuilder.AddCheckConstraint(
                name: "ck_pickup_request_acceptance",
                table: "pickup_requests",
                sql: "(accepted_at IS NULL AND estimated_ready_at IS NULL AND session_id IS NULL) OR (accepted_at IS NOT NULL AND estimated_ready_at IS NOT NULL AND estimated_ready_at > accepted_at AND session_id IS NOT NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_pickup_request_acceptance",
                table: "pickup_requests");

            migrationBuilder.AddCheckConstraint(
                name: "ck_pickup_request_acceptance",
                table: "pickup_requests",
                sql: "(accepted_at IS NULL AND estimated_ready_at IS NULL AND session_id IS NULL) OR (accepted_at IS NOT NULL AND estimated_ready_at > accepted_at AND session_id IS NOT NULL)");
        }
    }
}
