using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddOnlineRequests : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_session_active_table",
                table: "dining_sessions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_session_close_reason",
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

            migrationBuilder.AddColumn<long>(
                name: "delivery_fee_cents",
                table: "dining_sessions",
                type: "bigint",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "online_counters",
                columns: table => new
                {
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    business_date = table.Column<DateOnly>(type: "date", nullable: false),
                    last_number = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_online_counters", x => new { x.restaurant_id, x.business_date });
                    table.CheckConstraint("ck_online_counter_number", "last_number > 0");
                    table.ForeignKey(
                        name: "FK_online_counters_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "online_requests",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status_token = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    business_date = table.Column<DateOnly>(type: "date", nullable: false),
                    number = table.Column<int>(type: "integer", nullable: false),
                    fulfillment = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    customer_name = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    customer_phone = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    delivery_address = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    delivery_notes = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    items_total_cents = table.Column<long>(type: "bigint", nullable: false),
                    default_language_snapshot = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    submitted_at = table.Column<DateTime>(type: "timestamptz", nullable: false),
                    expires_at = table.Column<DateTime>(type: "timestamptz", nullable: false),
                    accepted_at = table.Column<DateTime>(type: "timestamptz", nullable: true),
                    estimated_at = table.Column<DateTime>(type: "timestamptz", nullable: true),
                    session_id = table.Column<Guid>(type: "uuid", nullable: true),
                    rejected_at = table.Column<DateTime>(type: "timestamptz", nullable: true),
                    reject_reason = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: true),
                    lines = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_online_requests", x => x.id);
                    table.UniqueConstraint("uq_online_requests_id_tenant", x => new { x.id, x.restaurant_id });
                    table.CheckConstraint("ck_online_request_accepted", "(accepted_at IS NULL AND estimated_at IS NULL AND session_id IS NULL) OR (accepted_at IS NOT NULL AND estimated_at IS NOT NULL AND estimated_at >= accepted_at AND session_id IS NOT NULL)");
                    table.CheckConstraint("ck_online_request_decision", "(accepted_at IS NULL OR rejected_at IS NULL) AND (accepted_at IS NULL OR accepted_at < expires_at) AND (rejected_at IS NULL OR rejected_at < expires_at)");
                    table.CheckConstraint("ck_online_request_expiry", "expires_at > submitted_at");
                    table.CheckConstraint("ck_online_request_fulfillment", "fulfillment IN ('PICKUP', 'DELIVERY')");
                    table.CheckConstraint("ck_online_request_language", "default_language_snapshot IN ('zh', 'it', 'en')");
                    table.CheckConstraint("ck_online_request_lines", "jsonb_typeof(lines) = 'array'");
                    table.CheckConstraint("ck_online_request_number", "number > 0");
                    table.CheckConstraint("ck_online_request_phone", "customer_phone IS NULL OR customer_phone ~ '^\\+?[0-9]{6,15}$'");
                    table.CheckConstraint("ck_online_request_pickup_address", "fulfillment = 'DELIVERY' OR (delivery_address IS NULL AND delivery_notes IS NULL)");
                    table.CheckConstraint("ck_online_request_reject_reason", "reject_reason IS NULL OR (rejected_at IS NOT NULL AND (reject_reason IN ('SOLD_OUT', 'BUSY', 'CLOSING') OR (reject_reason = 'OUT_OF_RANGE' AND fulfillment = 'DELIVERY')))");
                    table.CheckConstraint("ck_online_request_total", "items_total_cents > 0");
                    table.ForeignKey(
                        name: "FK_online_requests_dining_sessions_session_id_restaurant_id",
                        columns: x => new { x.session_id, x.restaurant_id },
                        principalTable: "dining_sessions",
                        principalColumns: new[] { "id", "restaurant_id" });
                    table.ForeignKey(
                        name: "FK_online_requests_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.AddCheckConstraint(
                name: "ck_session_channel",
                table: "dining_sessions",
                sql: "channel IN ('DINE_IN', 'PICKUP', 'DELIVERY')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_session_close_reason",
                table: "dining_sessions",
                sql: "close_reason IS NULL OR close_reason IN ('PAID', 'VOIDED') OR (close_reason = 'EMPTY' AND channel = 'DINE_IN') OR (close_reason = 'NO_SHOW' AND channel <> 'DINE_IN')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_session_delivery_fee",
                table: "dining_sessions",
                sql: "(channel = 'DELIVERY' AND delivery_fee_cents IS NOT NULL AND delivery_fee_cents >= 0) OR (channel <> 'DELIVERY' AND delivery_fee_cents IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_session_dine_in",
                table: "dining_sessions",
                sql: "channel <> 'DINE_IN' OR (table_label_snapshot IS NOT NULL AND (status <> 'ACTIVE' OR (table_id IS NOT NULL AND join_code_ciphertext IS NOT NULL)))");

            migrationBuilder.AddCheckConstraint(
                name: "ck_session_lifecycle",
                table: "dining_sessions",
                sql: "(status = 'ACTIVE' AND closed_at IS NULL AND close_reason IS NULL AND closed_total_cents IS NULL) OR (status = 'CLOSED' AND closed_at IS NOT NULL AND close_reason IS NOT NULL AND closed_total_cents IS NOT NULL AND join_code_ciphertext IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_session_online",
                table: "dining_sessions",
                sql: "channel = 'DINE_IN' OR (table_id IS NULL AND table_label_snapshot IS NULL AND join_code_ciphertext IS NULL)");

            migrationBuilder.CreateIndex(
                name: "ix_online_requests_contact",
                table: "online_requests",
                columns: new[] { "restaurant_id", "submitted_at" },
                filter: "customer_phone IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_online_requests_waiting",
                table: "online_requests",
                columns: new[] { "restaurant_id", "expires_at" },
                filter: "accepted_at IS NULL AND rejected_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "uq_online_request_client_request",
                table: "online_requests",
                columns: new[] { "restaurant_id", "client_request_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "uq_online_request_number",
                table: "online_requests",
                columns: new[] { "restaurant_id", "business_date", "number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "uq_online_request_session",
                table: "online_requests",
                columns: new[] { "session_id", "restaurant_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "uq_online_request_status_token",
                table: "online_requests",
                column: "status_token",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "online_counters");

            migrationBuilder.DropTable(
                name: "online_requests");

            migrationBuilder.DropCheckConstraint(
                name: "ck_session_channel",
                table: "dining_sessions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_session_close_reason",
                table: "dining_sessions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_session_delivery_fee",
                table: "dining_sessions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_session_dine_in",
                table: "dining_sessions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_session_lifecycle",
                table: "dining_sessions");

            migrationBuilder.DropCheckConstraint(
                name: "ck_session_online",
                table: "dining_sessions");

            migrationBuilder.DropColumn(
                name: "channel",
                table: "dining_sessions");

            migrationBuilder.DropColumn(
                name: "delivery_fee_cents",
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
                name: "ck_session_close_reason",
                table: "dining_sessions",
                sql: "close_reason IS NULL OR close_reason IN ('PAID', 'VOIDED', 'EMPTY')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_session_lifecycle",
                table: "dining_sessions",
                sql: "(status = 'ACTIVE' AND closed_at IS NULL AND close_reason IS NULL AND closed_total_cents IS NULL AND join_code_ciphertext IS NOT NULL) OR (status = 'CLOSED' AND closed_at IS NOT NULL AND close_reason IS NOT NULL AND closed_total_cents IS NOT NULL AND join_code_ciphertext IS NULL)");
        }
    }
}
