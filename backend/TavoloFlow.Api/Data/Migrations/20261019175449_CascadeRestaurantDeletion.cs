using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class CascadeRestaurantDeletion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_dining_sessions_restaurant_tables_table_id_restaurant_id",
                table: "dining_sessions");

            migrationBuilder.DropForeignKey(
                name: "FK_dining_sessions_restaurant_users_closed_by_user_id_restaura~",
                table: "dining_sessions");

            migrationBuilder.DropForeignKey(
                name: "FK_dining_sessions_restaurant_users_opened_by_user_id_restaura~",
                table: "dining_sessions");

            migrationBuilder.DropForeignKey(
                name: "FK_dining_sessions_restaurants_restaurant_id",
                table: "dining_sessions");

            migrationBuilder.DropForeignKey(
                name: "FK_menu_categories_restaurants_restaurant_id",
                table: "menu_categories");

            migrationBuilder.DropForeignKey(
                name: "FK_menu_items_menu_categories_category_id_restaurant_id",
                table: "menu_items");

            migrationBuilder.DropForeignKey(
                name: "FK_menu_items_restaurants_restaurant_id",
                table: "menu_items");

            migrationBuilder.DropForeignKey(
                name: "FK_order_items_menu_items_menu_item_id_restaurant_id",
                table: "order_items");

            migrationBuilder.DropForeignKey(
                name: "FK_order_items_orders_order_id_restaurant_id",
                table: "order_items");

            migrationBuilder.DropForeignKey(
                name: "FK_order_items_restaurants_restaurant_id",
                table: "order_items");

            migrationBuilder.DropForeignKey(
                name: "FK_orders_dining_sessions_dining_session_id_restaurant_id",
                table: "orders");

            migrationBuilder.DropForeignKey(
                name: "FK_orders_restaurant_users_cancelled_by_user_id_restaurant_id",
                table: "orders");

            migrationBuilder.DropForeignKey(
                name: "FK_orders_restaurants_restaurant_id",
                table: "orders");

            migrationBuilder.DropForeignKey(
                name: "FK_restaurant_tables_restaurants_restaurant_id",
                table: "restaurant_tables");

            migrationBuilder.DropForeignKey(
                name: "FK_restaurant_users_restaurants_restaurant_id",
                table: "restaurant_users");

            migrationBuilder.AddForeignKey(
                name: "FK_dining_sessions_restaurant_tables_table_id_restaurant_id",
                table: "dining_sessions",
                columns: new[] { "table_id", "restaurant_id" },
                principalTable: "restaurant_tables",
                principalColumns: new[] { "id", "restaurant_id" });

            migrationBuilder.AddForeignKey(
                name: "FK_dining_sessions_restaurant_users_closed_by_user_id_restaura~",
                table: "dining_sessions",
                columns: new[] { "closed_by_user_id", "restaurant_id" },
                principalTable: "restaurant_users",
                principalColumns: new[] { "id", "restaurant_id" });

            migrationBuilder.AddForeignKey(
                name: "FK_dining_sessions_restaurant_users_opened_by_user_id_restaura~",
                table: "dining_sessions",
                columns: new[] { "opened_by_user_id", "restaurant_id" },
                principalTable: "restaurant_users",
                principalColumns: new[] { "id", "restaurant_id" });

            migrationBuilder.AddForeignKey(
                name: "FK_dining_sessions_restaurants_restaurant_id",
                table: "dining_sessions",
                column: "restaurant_id",
                principalTable: "restaurants",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_menu_categories_restaurants_restaurant_id",
                table: "menu_categories",
                column: "restaurant_id",
                principalTable: "restaurants",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_menu_items_menu_categories_category_id_restaurant_id",
                table: "menu_items",
                columns: new[] { "category_id", "restaurant_id" },
                principalTable: "menu_categories",
                principalColumns: new[] { "id", "restaurant_id" });

            migrationBuilder.AddForeignKey(
                name: "FK_menu_items_restaurants_restaurant_id",
                table: "menu_items",
                column: "restaurant_id",
                principalTable: "restaurants",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_order_items_menu_items_menu_item_id_restaurant_id",
                table: "order_items",
                columns: new[] { "menu_item_id", "restaurant_id" },
                principalTable: "menu_items",
                principalColumns: new[] { "id", "restaurant_id" });

            migrationBuilder.AddForeignKey(
                name: "FK_order_items_orders_order_id_restaurant_id",
                table: "order_items",
                columns: new[] { "order_id", "restaurant_id" },
                principalTable: "orders",
                principalColumns: new[] { "id", "restaurant_id" });

            migrationBuilder.AddForeignKey(
                name: "FK_order_items_restaurants_restaurant_id",
                table: "order_items",
                column: "restaurant_id",
                principalTable: "restaurants",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_orders_dining_sessions_dining_session_id_restaurant_id",
                table: "orders",
                columns: new[] { "dining_session_id", "restaurant_id" },
                principalTable: "dining_sessions",
                principalColumns: new[] { "id", "restaurant_id" });

            migrationBuilder.AddForeignKey(
                name: "FK_orders_restaurant_users_cancelled_by_user_id_restaurant_id",
                table: "orders",
                columns: new[] { "cancelled_by_user_id", "restaurant_id" },
                principalTable: "restaurant_users",
                principalColumns: new[] { "id", "restaurant_id" });

            migrationBuilder.AddForeignKey(
                name: "FK_orders_restaurants_restaurant_id",
                table: "orders",
                column: "restaurant_id",
                principalTable: "restaurants",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_restaurant_tables_restaurants_restaurant_id",
                table: "restaurant_tables",
                column: "restaurant_id",
                principalTable: "restaurants",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_restaurant_users_restaurants_restaurant_id",
                table: "restaurant_users",
                column: "restaurant_id",
                principalTable: "restaurants",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_dining_sessions_restaurant_tables_table_id_restaurant_id",
                table: "dining_sessions");

            migrationBuilder.DropForeignKey(
                name: "FK_dining_sessions_restaurant_users_closed_by_user_id_restaura~",
                table: "dining_sessions");

            migrationBuilder.DropForeignKey(
                name: "FK_dining_sessions_restaurant_users_opened_by_user_id_restaura~",
                table: "dining_sessions");

            migrationBuilder.DropForeignKey(
                name: "FK_dining_sessions_restaurants_restaurant_id",
                table: "dining_sessions");

            migrationBuilder.DropForeignKey(
                name: "FK_menu_categories_restaurants_restaurant_id",
                table: "menu_categories");

            migrationBuilder.DropForeignKey(
                name: "FK_menu_items_menu_categories_category_id_restaurant_id",
                table: "menu_items");

            migrationBuilder.DropForeignKey(
                name: "FK_menu_items_restaurants_restaurant_id",
                table: "menu_items");

            migrationBuilder.DropForeignKey(
                name: "FK_order_items_menu_items_menu_item_id_restaurant_id",
                table: "order_items");

            migrationBuilder.DropForeignKey(
                name: "FK_order_items_orders_order_id_restaurant_id",
                table: "order_items");

            migrationBuilder.DropForeignKey(
                name: "FK_order_items_restaurants_restaurant_id",
                table: "order_items");

            migrationBuilder.DropForeignKey(
                name: "FK_orders_dining_sessions_dining_session_id_restaurant_id",
                table: "orders");

            migrationBuilder.DropForeignKey(
                name: "FK_orders_restaurant_users_cancelled_by_user_id_restaurant_id",
                table: "orders");

            migrationBuilder.DropForeignKey(
                name: "FK_orders_restaurants_restaurant_id",
                table: "orders");

            migrationBuilder.DropForeignKey(
                name: "FK_restaurant_tables_restaurants_restaurant_id",
                table: "restaurant_tables");

            migrationBuilder.DropForeignKey(
                name: "FK_restaurant_users_restaurants_restaurant_id",
                table: "restaurant_users");

            migrationBuilder.AddForeignKey(
                name: "FK_dining_sessions_restaurant_tables_table_id_restaurant_id",
                table: "dining_sessions",
                columns: new[] { "table_id", "restaurant_id" },
                principalTable: "restaurant_tables",
                principalColumns: new[] { "id", "restaurant_id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_dining_sessions_restaurant_users_closed_by_user_id_restaura~",
                table: "dining_sessions",
                columns: new[] { "closed_by_user_id", "restaurant_id" },
                principalTable: "restaurant_users",
                principalColumns: new[] { "id", "restaurant_id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_dining_sessions_restaurant_users_opened_by_user_id_restaura~",
                table: "dining_sessions",
                columns: new[] { "opened_by_user_id", "restaurant_id" },
                principalTable: "restaurant_users",
                principalColumns: new[] { "id", "restaurant_id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_dining_sessions_restaurants_restaurant_id",
                table: "dining_sessions",
                column: "restaurant_id",
                principalTable: "restaurants",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_menu_categories_restaurants_restaurant_id",
                table: "menu_categories",
                column: "restaurant_id",
                principalTable: "restaurants",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_menu_items_menu_categories_category_id_restaurant_id",
                table: "menu_items",
                columns: new[] { "category_id", "restaurant_id" },
                principalTable: "menu_categories",
                principalColumns: new[] { "id", "restaurant_id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_menu_items_restaurants_restaurant_id",
                table: "menu_items",
                column: "restaurant_id",
                principalTable: "restaurants",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_order_items_menu_items_menu_item_id_restaurant_id",
                table: "order_items",
                columns: new[] { "menu_item_id", "restaurant_id" },
                principalTable: "menu_items",
                principalColumns: new[] { "id", "restaurant_id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_order_items_orders_order_id_restaurant_id",
                table: "order_items",
                columns: new[] { "order_id", "restaurant_id" },
                principalTable: "orders",
                principalColumns: new[] { "id", "restaurant_id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_order_items_restaurants_restaurant_id",
                table: "order_items",
                column: "restaurant_id",
                principalTable: "restaurants",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_orders_dining_sessions_dining_session_id_restaurant_id",
                table: "orders",
                columns: new[] { "dining_session_id", "restaurant_id" },
                principalTable: "dining_sessions",
                principalColumns: new[] { "id", "restaurant_id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_orders_restaurant_users_cancelled_by_user_id_restaurant_id",
                table: "orders",
                columns: new[] { "cancelled_by_user_id", "restaurant_id" },
                principalTable: "restaurant_users",
                principalColumns: new[] { "id", "restaurant_id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_orders_restaurants_restaurant_id",
                table: "orders",
                column: "restaurant_id",
                principalTable: "restaurants",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_restaurant_tables_restaurants_restaurant_id",
                table: "restaurant_tables",
                column: "restaurant_id",
                principalTable: "restaurants",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_restaurant_users_restaurants_restaurant_id",
                table: "restaurant_users",
                column: "restaurant_id",
                principalTable: "restaurants",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
