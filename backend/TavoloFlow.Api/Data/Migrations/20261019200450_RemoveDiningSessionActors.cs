using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class RemoveDiningSessionActors : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_dining_sessions_restaurant_users_closed_by_user_id_restaura~",
                table: "dining_sessions");

            migrationBuilder.DropForeignKey(
                name: "FK_dining_sessions_restaurant_users_opened_by_user_id_restaura~",
                table: "dining_sessions");

            migrationBuilder.DropIndex(
                name: "IX_dining_sessions_closed_by_user_id_restaurant_id",
                table: "dining_sessions");

            migrationBuilder.DropIndex(
                name: "IX_dining_sessions_opened_by_user_id_restaurant_id",
                table: "dining_sessions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_session_lifecycle",
                table: "dining_sessions");

            migrationBuilder.DropColumn(
                name: "closed_by_user_id",
                table: "dining_sessions");

            migrationBuilder.DropColumn(
                name: "opened_by_user_id",
                table: "dining_sessions");

            migrationBuilder.AddCheckConstraint(
                name: "ck_session_lifecycle",
                table: "dining_sessions",
                sql: "(status = 'ACTIVE' AND closed_at IS NULL AND close_reason IS NULL AND closed_total_cents IS NULL AND join_code_ciphertext IS NOT NULL) OR (status = 'CLOSED' AND closed_at IS NOT NULL AND close_reason IS NOT NULL AND closed_total_cents IS NOT NULL AND join_code_ciphertext IS NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            throw new NotSupportedException(
                "RemoveDiningSessionActors cannot be downgraded because the removed account attribution cannot be reconstructed. " +
                "Restore a database backup to recover the previous schema and attribution.");
        }
    }
}
