using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddRestaurantGoogleMapsUrl : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "google_maps_url",
                table: "restaurants",
                type: "character varying(2048)",
                maxLength: 2048,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_restaurant_google_maps_url",
                table: "restaurants",
                sql: "google_maps_url IS NULL OR google_maps_url LIKE 'https://%'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_restaurant_google_maps_url",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "google_maps_url",
                table: "restaurants");
        }
    }
}
