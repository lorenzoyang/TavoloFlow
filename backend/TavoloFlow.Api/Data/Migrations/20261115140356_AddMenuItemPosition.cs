using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddMenuItemPosition : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "position",
                table: "menu_items",
                type: "integer",
                nullable: true);

            migrationBuilder.Sql(
                """
                WITH ranked AS (
                    SELECT id, (row_number() OVER (
                        PARTITION BY restaurant_id, category_id ORDER BY id
                    ) - 1)::integer AS position
                    FROM menu_items
                )
                UPDATE menu_items AS item
                SET position = ranked.position
                FROM ranked
                WHERE item.id = ranked.id;
                """);

            migrationBuilder.AlterColumn<int>(
                name: "position",
                table: "menu_items",
                type: "integer",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_item_position",
                table: "menu_items",
                sql: "position >= 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_item_position",
                table: "menu_items");

            migrationBuilder.DropColumn(
                name: "position",
                table: "menu_items");
        }
    }
}
