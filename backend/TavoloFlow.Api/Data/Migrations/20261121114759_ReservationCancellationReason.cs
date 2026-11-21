using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ReservationCancellationReason : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "reservation_cancel_reason",
                table: "dining_sessions",
                type: "character varying(24)",
                maxLength: 24,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_session_reservation_cancel_reason",
                table: "dining_sessions",
                sql: "reservation_cancel_reason IS NULL OR (channel = 'PICKUP' AND status = 'CLOSED' AND close_reason = 'VOIDED' AND reservation_cancel_reason IN ('SOLD_OUT', 'CANNOT_PREPARE_ON_TIME', 'CUSTOMER_REQUEST'))");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_session_reservation_cancel_reason",
                table: "dining_sessions");

            migrationBuilder.DropColumn(
                name: "reservation_cancel_reason",
                table: "dining_sessions");
        }
    }
}
