using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class PickupRequests : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "pickup_counters",
                columns: table => new
                {
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    business_date = table.Column<DateOnly>(type: "date", nullable: false),
                    last_number = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_pickup_counters", x => new { x.restaurant_id, x.business_date });
                    table.CheckConstraint("ck_pickup_counter_number", "last_number > 0");
                    table.ForeignKey(
                        name: "FK_pickup_counters_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "pickup_requests",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status_token = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    business_date = table.Column<DateOnly>(type: "date", nullable: false),
                    pickup_number = table.Column<int>(type: "integer", nullable: false),
                    customer_name = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    customer_phone = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    total_amount_cents = table.Column<long>(type: "bigint", nullable: false),
                    default_language_snapshot = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    submitted_at = table.Column<DateTime>(type: "timestamptz", nullable: false),
                    expires_at = table.Column<DateTime>(type: "timestamptz", nullable: false),
                    accepted_at = table.Column<DateTime>(type: "timestamptz", nullable: true),
                    estimated_ready_at = table.Column<DateTime>(type: "timestamptz", nullable: true),
                    session_id = table.Column<Guid>(type: "uuid", nullable: true),
                    rejected_at = table.Column<DateTime>(type: "timestamptz", nullable: true),
                    reject_reason = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_pickup_requests", x => x.id);
                    table.UniqueConstraint("uq_pickup_requests_id_tenant", x => new { x.id, x.restaurant_id });
                    table.CheckConstraint("ck_pickup_request_acceptance", "(accepted_at IS NULL AND estimated_ready_at IS NULL AND session_id IS NULL) OR (accepted_at IS NOT NULL AND estimated_ready_at > accepted_at AND session_id IS NOT NULL)");
                    table.CheckConstraint("ck_pickup_request_amount", "total_amount_cents > 0");
                    table.CheckConstraint("ck_pickup_request_decision_time", "(accepted_at IS NULL OR (accepted_at >= submitted_at AND accepted_at < expires_at)) AND (rejected_at IS NULL OR (rejected_at >= submitted_at AND rejected_at < expires_at))");
                    table.CheckConstraint("ck_pickup_request_expiry", "expires_at > submitted_at");
                    table.CheckConstraint("ck_pickup_request_language", "default_language_snapshot IN ('zh', 'it', 'en')");
                    table.CheckConstraint("ck_pickup_request_name", "customer_name ~ '[^[:space:]]'");
                    table.CheckConstraint("ck_pickup_request_number", "pickup_number > 0");
                    table.CheckConstraint("ck_pickup_request_one_decision", "accepted_at IS NULL OR rejected_at IS NULL");
                    table.CheckConstraint("ck_pickup_request_phone", "customer_phone ~ '^\\+?[0-9]{6,15}$'");
                    table.CheckConstraint("ck_pickup_request_reject_reason", "reject_reason IS NULL OR (rejected_at IS NOT NULL AND reject_reason IN ('SOLD_OUT', 'BUSY', 'CLOSING'))");
                    table.ForeignKey(
                        name: "FK_pickup_requests_dining_sessions_session_id_restaurant_id",
                        columns: x => new { x.session_id, x.restaurant_id },
                        principalTable: "dining_sessions",
                        principalColumns: new[] { "id", "restaurant_id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_pickup_requests_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "pickup_request_items",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    pickup_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    menu_item_id = table.Column<Guid>(type: "uuid", nullable: true),
                    item_code_snapshot = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    name_zh_snapshot = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    name_it_snapshot = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    name_en_snapshot = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    allergen_codes_snapshot = table.Column<string[]>(type: "text[]", nullable: false, defaultValueSql: "'{}'::text[]"),
                    unit_price_cents = table.Column<long>(type: "bigint", nullable: false),
                    quantity = table.Column<int>(type: "integer", nullable: false),
                    remark = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_pickup_request_items", x => x.id);
                    table.CheckConstraint("ck_pickup_request_item_has_name", "concat(name_zh_snapshot, name_it_snapshot, name_en_snapshot) ~ '[^[:space:]]'");
                    table.CheckConstraint("ck_pickup_request_item_quantity", "quantity BETWEEN 1 AND 20");
                    table.CheckConstraint("ck_pickup_request_item_remark", "remark IS NULL OR char_length(remark) <= 200");
                    table.CheckConstraint("ck_pickup_request_item_unit_price", "unit_price_cents > 0");
                    table.ForeignKey(
                        name: "FK_pickup_request_items_menu_items_menu_item_id_restaurant_id",
                        columns: x => new { x.menu_item_id, x.restaurant_id },
                        principalTable: "menu_items",
                        principalColumns: new[] { "id", "restaurant_id" });
                    table.ForeignKey(
                        name: "FK_pickup_request_items_pickup_requests_pickup_request_id_rest~",
                        columns: x => new { x.pickup_request_id, x.restaurant_id },
                        principalTable: "pickup_requests",
                        principalColumns: new[] { "id", "restaurant_id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_pickup_request_items_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_pickup_request_items_menu_item_id_restaurant_id",
                table: "pickup_request_items",
                columns: new[] { "menu_item_id", "restaurant_id" });

            migrationBuilder.CreateIndex(
                name: "IX_pickup_request_items_pickup_request_id_restaurant_id",
                table: "pickup_request_items",
                columns: new[] { "pickup_request_id", "restaurant_id" });

            migrationBuilder.CreateIndex(
                name: "IX_pickup_request_items_restaurant_id",
                table: "pickup_request_items",
                column: "restaurant_id");

            migrationBuilder.CreateIndex(
                name: "IX_pickup_requests_restaurant_id_business_date",
                table: "pickup_requests",
                columns: new[] { "restaurant_id", "business_date" });

            migrationBuilder.CreateIndex(
                name: "IX_pickup_requests_restaurant_id_expires_at",
                table: "pickup_requests",
                columns: new[] { "restaurant_id", "expires_at" });

            migrationBuilder.CreateIndex(
                name: "uq_pickup_number",
                table: "pickup_requests",
                columns: new[] { "restaurant_id", "business_date", "pickup_number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "uq_pickup_request_per_client",
                table: "pickup_requests",
                columns: new[] { "restaurant_id", "client_request_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "uq_pickup_request_session",
                table: "pickup_requests",
                columns: new[] { "session_id", "restaurant_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "uq_pickup_request_token",
                table: "pickup_requests",
                column: "status_token",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "pickup_counters");

            migrationBuilder.DropTable(
                name: "pickup_request_items");

            migrationBuilder.DropTable(
                name: "pickup_requests");
        }
    }
}
