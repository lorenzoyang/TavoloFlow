using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddMenuOptions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "options_snapshot",
                table: "order_items",
                type: "jsonb",
                nullable: false,
                // Existing order lines had no options; EF proposes an object, but the column holds an array.
                defaultValue: "[]");

            migrationBuilder.CreateTable(
                name: "menu_option_groups",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name_zh = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    name_it = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    name_en = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    min_select = table.Column<int>(type: "integer", nullable: false),
                    max_select = table.Column<int>(type: "integer", nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_menu_option_groups", x => x.id);
                    table.UniqueConstraint("uq_option_groups_id_tenant", x => new { x.id, x.restaurant_id });
                    table.CheckConstraint("ck_option_group_has_name", "concat(name_zh, name_it, name_en) ~ '[^[:space:]]'");
                    table.CheckConstraint("ck_option_group_selection", "min_select >= 0 AND max_select >= 1 AND min_select <= max_select");
                    table.ForeignKey(
                        name: "FK_menu_option_groups_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "menu_item_option_groups",
                columns: table => new
                {
                    menu_item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    group_id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_menu_item_option_groups", x => new { x.menu_item_id, x.group_id });
                    table.ForeignKey(
                        name: "FK_menu_item_option_groups_menu_items_menu_item_id_restaurant_~",
                        columns: x => new { x.menu_item_id, x.restaurant_id },
                        principalTable: "menu_items",
                        principalColumns: new[] { "id", "restaurant_id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_menu_item_option_groups_menu_option_groups_group_id_restaur~",
                        columns: x => new { x.group_id, x.restaurant_id },
                        principalTable: "menu_option_groups",
                        principalColumns: new[] { "id", "restaurant_id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "menu_options",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    group_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name_zh = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    name_it = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    name_en = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    price_delta_cents = table.Column<long>(type: "bigint", nullable: false),
                    allergen_codes = table.Column<string[]>(type: "text[]", nullable: false, defaultValueSql: "'{}'::text[]"),
                    is_available = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_menu_options", x => x.id);
                    table.CheckConstraint("ck_option_has_name", "concat(name_zh, name_it, name_en) ~ '[^[:space:]]'");
                    table.CheckConstraint("ck_option_price_delta", "price_delta_cents >= 0");
                    table.ForeignKey(
                        name: "FK_menu_options_menu_option_groups_group_id_restaurant_id",
                        columns: x => new { x.group_id, x.restaurant_id },
                        principalTable: "menu_option_groups",
                        principalColumns: new[] { "id", "restaurant_id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.AddCheckConstraint(
                name: "ck_order_item_options",
                table: "order_items",
                sql: "jsonb_typeof(options_snapshot) = 'array'");

            migrationBuilder.CreateIndex(
                name: "IX_menu_item_option_groups_group_id_restaurant_id",
                table: "menu_item_option_groups",
                columns: new[] { "group_id", "restaurant_id" });

            migrationBuilder.CreateIndex(
                name: "IX_menu_item_option_groups_menu_item_id_restaurant_id",
                table: "menu_item_option_groups",
                columns: new[] { "menu_item_id", "restaurant_id" });

            migrationBuilder.CreateIndex(
                name: "IX_menu_item_option_groups_restaurant_id",
                table: "menu_item_option_groups",
                column: "restaurant_id");

            migrationBuilder.CreateIndex(
                name: "IX_menu_option_groups_restaurant_id_position",
                table: "menu_option_groups",
                columns: new[] { "restaurant_id", "position" });

            migrationBuilder.CreateIndex(
                name: "IX_menu_options_group_id_restaurant_id",
                table: "menu_options",
                columns: new[] { "group_id", "restaurant_id" });

            migrationBuilder.CreateIndex(
                name: "IX_menu_options_restaurant_id",
                table: "menu_options",
                column: "restaurant_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "menu_item_option_groups");

            migrationBuilder.DropTable(
                name: "menu_options");

            migrationBuilder.DropTable(
                name: "menu_option_groups");

            migrationBuilder.DropCheckConstraint(
                name: "ck_order_item_options",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "options_snapshot",
                table: "order_items");
        }
    }
}
