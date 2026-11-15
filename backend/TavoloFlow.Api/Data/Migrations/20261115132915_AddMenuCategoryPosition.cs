using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddMenuCategoryPosition : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "position",
                table: "menu_categories",
                type: "integer",
                nullable: true);

            // Preserve the order each restaurant saw before categories gained an explicit position.
            migrationBuilder.Sql(
                """
                WITH ranked AS (
                    SELECT id, (row_number() OVER (PARTITION BY restaurant_id ORDER BY id) - 1)::integer AS position
                    FROM menu_categories
                )
                UPDATE menu_categories AS category
                SET position = ranked.position
                FROM ranked
                WHERE category.id = ranked.id;
                """);

            migrationBuilder.AlterColumn<int>(
                name: "position",
                table: "menu_categories",
                type: "integer",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_category_position",
                table: "menu_categories",
                sql: "position >= 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_category_position",
                table: "menu_categories");

            migrationBuilder.DropColumn(
                name: "position",
                table: "menu_categories");
        }
    }
}
