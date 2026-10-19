using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "platform_users",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    username = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    password_hash = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    credential_version = table.Column<int>(type: "integer", nullable: false, defaultValue: 1),
                    created_at = table.Column<DateTime>(type: "timestamptz", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_platform_users", x => x.id);
                    table.CheckConstraint("ck_platform_user_credential_version", "credential_version > 0");
                });

            migrationBuilder.CreateTable(
                name: "restaurants",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    default_language = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    time_zone = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false, defaultValue: "Europe/Rome"),
                    currency_code = table.Column<string>(type: "character(3)", nullable: false, defaultValue: "EUR"),
                    service_status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false, defaultValue: "SUSPENDED"),
                    ordering_enabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    created_at = table.Column<DateTime>(type: "timestamptz", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_restaurants", x => x.id);
                    table.CheckConstraint("ck_restaurant_currency", "currency_code = 'EUR'");
                    table.CheckConstraint("ck_restaurant_default_language", "default_language IN ('zh', 'it', 'en')");
                    table.CheckConstraint("ck_restaurant_service_status", "service_status IN ('ACTIVE', 'SUSPENDED')");
                });

            migrationBuilder.CreateTable(
                name: "menu_categories",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name_zh = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    name_it = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    name_en = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    deleted_at = table.Column<DateTime>(type: "timestamptz", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamptz", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_menu_categories", x => x.id);
                    table.UniqueConstraint("uq_categories_id_tenant", x => new { x.id, x.restaurant_id });
                    table.CheckConstraint("ck_category_has_name", "concat(name_zh, name_it, name_en) ~ '[^[:space:]]'");
                    table.ForeignKey(
                        name: "FK_menu_categories_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "restaurant_tables",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    table_label = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    qr_token = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    is_enabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    deleted_at = table.Column<DateTime>(type: "timestamptz", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamptz", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_restaurant_tables", x => x.id);
                    table.UniqueConstraint("uq_tables_id_tenant", x => new { x.id, x.restaurant_id });
                    table.ForeignKey(
                        name: "FK_restaurant_tables_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "restaurant_users",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    username = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    password_hash = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    role = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    must_change_password = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    credential_version = table.Column<int>(type: "integer", nullable: false, defaultValue: 1),
                    created_at = table.Column<DateTime>(type: "timestamptz", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_restaurant_users", x => x.id);
                    table.UniqueConstraint("uq_restaurant_users_id_tenant", x => new { x.id, x.restaurant_id });
                    table.CheckConstraint("ck_restaurant_user_credential_version", "credential_version > 0");
                    table.CheckConstraint("ck_restaurant_user_role", "role IN ('OWNER', 'STAFF')");
                    table.CheckConstraint("ck_restaurant_user_username", "username = lower(btrim(username)) AND username ~ '[^[:space:]]'");
                    table.ForeignKey(
                        name: "FK_restaurant_users_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "menu_items",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    category_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_code = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    name_zh = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    name_it = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    name_en = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    description_zh = table.Column<string>(type: "text", nullable: true),
                    description_it = table.Column<string>(type: "text", nullable: true),
                    description_en = table.Column<string>(type: "text", nullable: true),
                    price_cents = table.Column<long>(type: "bigint", nullable: false),
                    allergen_codes = table.Column<string[]>(type: "text[]", nullable: false, defaultValueSql: "'{}'::text[]"),
                    allergen_reviewed = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    is_available = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    deleted_at = table.Column<DateTime>(type: "timestamptz", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamptz", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_menu_items", x => x.id);
                    table.UniqueConstraint("uq_menu_items_id_tenant", x => new { x.id, x.restaurant_id });
                    table.CheckConstraint("ck_item_has_name", "concat(name_zh, name_it, name_en) ~ '[^[:space:]]'");
                    table.CheckConstraint("ck_item_positive_price", "price_cents > 0");
                    table.ForeignKey(
                        name: "FK_menu_items_menu_categories_category_id_restaurant_id",
                        columns: x => new { x.category_id, x.restaurant_id },
                        principalTable: "menu_categories",
                        principalColumns: new[] { "id", "restaurant_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_menu_items_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "dining_sessions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    table_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "ACTIVE"),
                    join_code_ciphertext = table.Column<string>(type: "text", nullable: true),
                    bill_version = table.Column<int>(type: "integer", nullable: false, defaultValue: 1),
                    table_label_snapshot = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    opened_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    opened_at = table.Column<DateTime>(type: "timestamptz", nullable: false, defaultValueSql: "now()"),
                    closed_at = table.Column<DateTime>(type: "timestamptz", nullable: true),
                    closed_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    close_reason = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    closed_total_cents = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_dining_sessions", x => x.id);
                    table.UniqueConstraint("uq_sessions_id_tenant", x => new { x.id, x.restaurant_id });
                    table.CheckConstraint("ck_session_bill_version", "bill_version > 0");
                    table.CheckConstraint("ck_session_close_reason", "close_reason IS NULL OR close_reason IN ('PAID', 'VOIDED', 'EMPTY')");
                    table.CheckConstraint("ck_session_close_time", "closed_at IS NULL OR closed_at >= opened_at");
                    table.CheckConstraint("ck_session_closed_total", "closed_total_cents IS NULL OR closed_total_cents >= 0");
                    table.CheckConstraint("ck_session_lifecycle", "(status = 'ACTIVE' AND closed_at IS NULL AND closed_by_user_id IS NULL AND close_reason IS NULL AND closed_total_cents IS NULL AND join_code_ciphertext IS NOT NULL) OR (status = 'CLOSED' AND closed_at IS NOT NULL AND closed_by_user_id IS NOT NULL AND close_reason IS NOT NULL AND closed_total_cents IS NOT NULL AND join_code_ciphertext IS NULL)");
                    table.CheckConstraint("ck_session_status", "status IN ('ACTIVE', 'CLOSED')");
                    table.ForeignKey(
                        name: "FK_dining_sessions_restaurant_tables_table_id_restaurant_id",
                        columns: x => new { x.table_id, x.restaurant_id },
                        principalTable: "restaurant_tables",
                        principalColumns: new[] { "id", "restaurant_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_dining_sessions_restaurant_users_closed_by_user_id_restaura~",
                        columns: x => new { x.closed_by_user_id, x.restaurant_id },
                        principalTable: "restaurant_users",
                        principalColumns: new[] { "id", "restaurant_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_dining_sessions_restaurant_users_opened_by_user_id_restaura~",
                        columns: x => new { x.opened_by_user_id, x.restaurant_id },
                        principalTable: "restaurant_users",
                        principalColumns: new[] { "id", "restaurant_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_dining_sessions_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "orders",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    dining_session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: false, defaultValue: "NEW"),
                    total_amount_cents = table.Column<long>(type: "bigint", nullable: false),
                    order_note = table.Column<string>(type: "text", nullable: true),
                    default_language_snapshot = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamptz", nullable: false, defaultValueSql: "now()"),
                    ready_at = table.Column<DateTime>(type: "timestamptz", nullable: true),
                    cancelled_at = table.Column<DateTime>(type: "timestamptz", nullable: true),
                    cancelled_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    cancel_reason = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_orders", x => x.id);
                    table.UniqueConstraint("uq_orders_id_tenant", x => new { x.id, x.restaurant_id });
                    table.CheckConstraint("ck_order_amount", "total_amount_cents >= 0");
                    table.CheckConstraint("ck_order_language", "default_language_snapshot IN ('zh', 'it', 'en')");
                    table.CheckConstraint("ck_order_lifecycle", "(status = 'NEW' AND ready_at IS NULL AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL AND cancel_reason IS NULL) OR (status = 'READY' AND ready_at IS NOT NULL AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL AND cancel_reason IS NULL) OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL AND cancel_reason IS NOT NULL AND cancel_reason ~ '[^[:space:]]')");
                    table.CheckConstraint("ck_order_status", "status IN ('NEW', 'READY', 'CANCELLED')");
                    table.CheckConstraint("ck_order_transition_times", "(ready_at IS NULL OR ready_at >= created_at) AND (cancelled_at IS NULL OR cancelled_at >= created_at) AND (ready_at IS NULL OR cancelled_at IS NULL OR cancelled_at >= ready_at)");
                    table.ForeignKey(
                        name: "FK_orders_dining_sessions_dining_session_id_restaurant_id",
                        columns: x => new { x.dining_session_id, x.restaurant_id },
                        principalTable: "dining_sessions",
                        principalColumns: new[] { "id", "restaurant_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_orders_restaurant_users_cancelled_by_user_id_restaurant_id",
                        columns: x => new { x.cancelled_by_user_id, x.restaurant_id },
                        principalTable: "restaurant_users",
                        principalColumns: new[] { "id", "restaurant_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_orders_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "order_items",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    order_id = table.Column<Guid>(type: "uuid", nullable: false),
                    menu_item_id = table.Column<Guid>(type: "uuid", nullable: false),
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
                    table.PrimaryKey("PK_order_items", x => x.id);
                    table.CheckConstraint("ck_order_item_has_name", "concat(name_zh_snapshot, name_it_snapshot, name_en_snapshot) ~ '[^[:space:]]'");
                    table.CheckConstraint("ck_order_item_quantity", "quantity > 0");
                    table.CheckConstraint("ck_order_item_unit_price", "unit_price_cents >= 0");
                    table.ForeignKey(
                        name: "FK_order_items_menu_items_menu_item_id_restaurant_id",
                        columns: x => new { x.menu_item_id, x.restaurant_id },
                        principalTable: "menu_items",
                        principalColumns: new[] { "id", "restaurant_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_order_items_orders_order_id_restaurant_id",
                        columns: x => new { x.order_id, x.restaurant_id },
                        principalTable: "orders",
                        principalColumns: new[] { "id", "restaurant_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_order_items_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_dining_sessions_closed_by_user_id_restaurant_id",
                table: "dining_sessions",
                columns: new[] { "closed_by_user_id", "restaurant_id" });

            migrationBuilder.CreateIndex(
                name: "IX_dining_sessions_opened_by_user_id_restaurant_id",
                table: "dining_sessions",
                columns: new[] { "opened_by_user_id", "restaurant_id" });

            migrationBuilder.CreateIndex(
                name: "IX_dining_sessions_restaurant_id",
                table: "dining_sessions",
                column: "restaurant_id");

            migrationBuilder.CreateIndex(
                name: "IX_dining_sessions_table_id_restaurant_id",
                table: "dining_sessions",
                columns: new[] { "table_id", "restaurant_id" });

            migrationBuilder.CreateIndex(
                name: "IX_dining_sessions_table_id_status",
                table: "dining_sessions",
                columns: new[] { "table_id", "status" });

            migrationBuilder.CreateIndex(
                name: "uq_active_session_per_table",
                table: "dining_sessions",
                column: "table_id",
                unique: true,
                filter: "status = 'ACTIVE'");

            migrationBuilder.CreateIndex(
                name: "IX_menu_categories_restaurant_id",
                table: "menu_categories",
                column: "restaurant_id");

            migrationBuilder.CreateIndex(
                name: "IX_menu_items_category_id_restaurant_id",
                table: "menu_items",
                columns: new[] { "category_id", "restaurant_id" });

            migrationBuilder.CreateIndex(
                name: "IX_menu_items_restaurant_id_category_id",
                table: "menu_items",
                columns: new[] { "restaurant_id", "category_id" });

            migrationBuilder.CreateIndex(
                name: "uq_menu_items_active_code",
                table: "menu_items",
                columns: new[] { "restaurant_id", "item_code" },
                unique: true,
                filter: "deleted_at IS NULL AND item_code IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_order_items_menu_item_id_restaurant_id",
                table: "order_items",
                columns: new[] { "menu_item_id", "restaurant_id" });

            migrationBuilder.CreateIndex(
                name: "IX_order_items_order_id_restaurant_id",
                table: "order_items",
                columns: new[] { "order_id", "restaurant_id" });

            migrationBuilder.CreateIndex(
                name: "IX_order_items_restaurant_id",
                table: "order_items",
                column: "restaurant_id");

            migrationBuilder.CreateIndex(
                name: "IX_orders_cancelled_by_user_id_restaurant_id",
                table: "orders",
                columns: new[] { "cancelled_by_user_id", "restaurant_id" });

            migrationBuilder.CreateIndex(
                name: "IX_orders_dining_session_id_restaurant_id",
                table: "orders",
                columns: new[] { "dining_session_id", "restaurant_id" });

            migrationBuilder.CreateIndex(
                name: "IX_orders_restaurant_id_status_created_at",
                table: "orders",
                columns: new[] { "restaurant_id", "status", "created_at" });

            migrationBuilder.CreateIndex(
                name: "uq_order_one_per_request",
                table: "orders",
                columns: new[] { "dining_session_id", "client_request_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_platform_users_username",
                table: "platform_users",
                column: "username",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_restaurant_tables_qr_token",
                table: "restaurant_tables",
                column: "qr_token",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_restaurant_tables_restaurant_id",
                table: "restaurant_tables",
                column: "restaurant_id");

            migrationBuilder.CreateIndex(
                name: "uq_tables_active_label",
                table: "restaurant_tables",
                columns: new[] { "restaurant_id", "table_label" },
                unique: true,
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_restaurant_users_username",
                table: "restaurant_users",
                column: "username",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "uq_restaurant_account_role",
                table: "restaurant_users",
                columns: new[] { "restaurant_id", "role" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "order_items");

            migrationBuilder.DropTable(
                name: "platform_users");

            migrationBuilder.DropTable(
                name: "menu_items");

            migrationBuilder.DropTable(
                name: "orders");

            migrationBuilder.DropTable(
                name: "menu_categories");

            migrationBuilder.DropTable(
                name: "dining_sessions");

            migrationBuilder.DropTable(
                name: "restaurant_tables");

            migrationBuilder.DropTable(
                name: "restaurant_users");

            migrationBuilder.DropTable(
                name: "restaurants");
        }
    }
}
