using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SessionChannel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_session_active_table",
                table: "dining_sessions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_session_lifecycle",
                table: "dining_sessions");

            migrationBuilder.AlterColumn<string>(
                name: "table_label_snapshot",
                table: "dining_sessions",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(50)",
                oldMaxLength: 50);

            migrationBuilder.AddColumn<string>(
                name: "channel",
                table: "dining_sessions",
                type: "character varying(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "DINE_IN");

            migrationBuilder.AddCheckConstraint(
                name: "ck_session_active_table",
                table: "dining_sessions",
                sql: "channel <> 'DINE_IN' OR status <> 'ACTIVE' OR table_id IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "ck_session_channel",
                table: "dining_sessions",
                sql: "channel IN ('DINE_IN', 'PICKUP')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_session_dine_in_label",
                table: "dining_sessions",
                sql: "channel <> 'DINE_IN' OR table_label_snapshot IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "ck_session_lifecycle",
                table: "dining_sessions",
                sql: "(status = 'ACTIVE' AND closed_at IS NULL AND close_reason IS NULL AND closed_total_cents IS NULL AND (channel = 'PICKUP' OR join_code_ciphertext IS NOT NULL)) OR (status = 'CLOSED' AND closed_at IS NOT NULL AND close_reason IS NOT NULL AND closed_total_cents IS NOT NULL AND join_code_ciphertext IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_session_pickup_fields",
                table: "dining_sessions",
                sql: "channel <> 'PICKUP' OR (table_id IS NULL AND table_label_snapshot IS NULL AND join_code_ciphertext IS NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_session_active_table",
                table: "dining_sessions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_session_channel",
                table: "dining_sessions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_session_dine_in_label",
                table: "dining_sessions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_session_lifecycle",
                table: "dining_sessions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_session_pickup_fields",
                table: "dining_sessions");

            migrationBuilder.DropColumn(
                name: "channel",
                table: "dining_sessions");

            migrationBuilder.AlterColumn<string>(
                name: "table_label_snapshot",
                table: "dining_sessions",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "character varying(50)",
                oldMaxLength: 50,
                oldNullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_session_active_table",
                table: "dining_sessions",
                sql: "status <> 'ACTIVE' OR table_id IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "ck_session_lifecycle",
                table: "dining_sessions",
                sql: "(status = 'ACTIVE' AND closed_at IS NULL AND close_reason IS NULL AND closed_total_cents IS NULL AND join_code_ciphertext IS NOT NULL) OR (status = 'CLOSED' AND closed_at IS NOT NULL AND close_reason IS NOT NULL AND closed_total_cents IS NOT NULL AND join_code_ciphertext IS NULL)");
        }
    }
}
