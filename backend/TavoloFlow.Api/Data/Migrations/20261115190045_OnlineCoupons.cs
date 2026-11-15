using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class OnlineCoupons : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "coupon_code",
                table: "online_requests",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "coupon_percent_off",
                table: "online_requests",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "online_coupons",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    percent_off = table.Column<int>(type: "integer", nullable: false),
                    valid_until = table.Column<DateOnly>(type: "date", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_online_coupons", x => x.id);
                    table.CheckConstraint("ck_online_coupon_code", "code ~ '^[A-Z0-9]{3,20}$'");
                    table.CheckConstraint("ck_online_coupon_percent", "percent_off BETWEEN 1 AND 50");
                    table.ForeignKey(
                        name: "FK_online_coupons_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.AddCheckConstraint(
                name: "ck_online_request_coupon",
                table: "online_requests",
                sql: "(coupon_code IS NULL AND coupon_percent_off IS NULL) OR (coupon_code IS NOT NULL AND coupon_percent_off IS NOT NULL AND coupon_percent_off BETWEEN 1 AND 50)");

            migrationBuilder.CreateIndex(
                name: "uq_online_coupon_code",
                table: "online_coupons",
                columns: new[] { "restaurant_id", "code" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "online_coupons");

            migrationBuilder.DropCheckConstraint(
                name: "ck_online_request_coupon",
                table: "online_requests");

            migrationBuilder.DropColumn(
                name: "coupon_code",
                table: "online_requests");

            migrationBuilder.DropColumn(
                name: "coupon_percent_off",
                table: "online_requests");
        }
    }
}
