using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class PickupClosure : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_session_close_reason",
                table: "dining_sessions");

            migrationBuilder.AddCheckConstraint(
                name: "ck_session_close_reason",
                table: "dining_sessions",
                sql: "close_reason IS NULL OR (channel = 'DINE_IN' AND close_reason IN ('PAID', 'VOIDED', 'EMPTY')) OR (channel = 'PICKUP' AND close_reason IN ('PAID', 'VOIDED', 'NO_SHOW'))");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_session_close_reason",
                table: "dining_sessions");

            migrationBuilder.AddCheckConstraint(
                name: "ck_session_close_reason",
                table: "dining_sessions",
                sql: "close_reason IS NULL OR close_reason IN ('PAID', 'VOIDED', 'EMPTY')");
        }
    }
}
