using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddDeliverySettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "delivery_enabled",
                table: "restaurants",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "delivery_note_en",
                table: "restaurants",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "delivery_note_it",
                table: "restaurants",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "delivery_note_zh",
                table: "restaurants",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "delivery_enabled",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "delivery_note_en",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "delivery_note_it",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "delivery_note_zh",
                table: "restaurants");
        }
    }
}
