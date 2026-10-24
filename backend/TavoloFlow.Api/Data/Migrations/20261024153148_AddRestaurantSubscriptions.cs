using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddRestaurantSubscriptions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "default_annual_fee_cents",
                table: "restaurants",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "owner_contact",
                table: "restaurants",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "subscription_version",
                table: "restaurants",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateTable(
                name: "restaurant_subscription_periods",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    starts_on = table.Column<DateOnly>(type: "date", nullable: false),
                    ends_on = table.Column<DateOnly>(type: "date", nullable: false),
                    years = table.Column<int>(type: "integer", nullable: false),
                    amount_cents = table.Column<long>(type: "bigint", nullable: false),
                    paid_on = table.Column<DateOnly>(type: "date", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamptz", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_restaurant_subscription_periods", x => x.id);
                    table.CheckConstraint("ck_subscription_period_amount", "amount_cents BETWEEN 1 AND 9007199254740991");
                    table.CheckConstraint("ck_subscription_period_dates", "ends_on > starts_on");
                    table.CheckConstraint("ck_subscription_period_years", "years BETWEEN 1 AND 9998");
                    table.ForeignKey(
                        name: "FK_restaurant_subscription_periods_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.AddCheckConstraint(
                name: "ck_restaurant_annual_fee",
                table: "restaurants",
                sql: "default_annual_fee_cents IS NULL OR default_annual_fee_cents BETWEEN 0 AND 9007199254740991");

            migrationBuilder.AddCheckConstraint(
                name: "ck_restaurant_subscription_version",
                table: "restaurants",
                sql: "subscription_version > 0");

            migrationBuilder.CreateIndex(
                name: "IX_restaurant_subscription_periods_restaurant_id_starts_on",
                table: "restaurant_subscription_periods",
                columns: new[] { "restaurant_id", "starts_on" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "restaurant_subscription_periods");

            migrationBuilder.DropCheckConstraint(
                name: "ck_restaurant_annual_fee",
                table: "restaurants");

            migrationBuilder.DropCheckConstraint(
                name: "ck_restaurant_subscription_version",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "default_annual_fee_cents",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "owner_contact",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "subscription_version",
                table: "restaurants");
        }
    }
}
