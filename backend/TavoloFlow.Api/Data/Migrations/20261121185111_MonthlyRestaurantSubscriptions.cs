using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class MonthlyRestaurantSubscriptions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The annual records were demo/test data. Monthly billing starts unconfigured.
            migrationBuilder.Sql("DELETE FROM restaurant_subscription_periods");
            migrationBuilder.Sql("UPDATE restaurants SET default_annual_fee_cents = NULL WHERE default_annual_fee_cents IS NOT NULL");

            migrationBuilder.DropCheckConstraint(
                name: "ck_restaurant_annual_fee",
                table: "restaurants");

            migrationBuilder.DropCheckConstraint(
                name: "ck_subscription_period_years",
                table: "restaurant_subscription_periods");

            migrationBuilder.RenameColumn(
                name: "default_annual_fee_cents",
                table: "restaurants",
                newName: "default_monthly_fee_cents");

            migrationBuilder.RenameColumn(
                name: "years",
                table: "restaurant_subscription_periods",
                newName: "months");

            migrationBuilder.AddColumn<long>(
                name: "monthly_fee_cents",
                table: "restaurant_subscription_periods",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.CreateTable(
                name: "platform_push_subscriptions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    platform_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    endpoint = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    p256dh = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    auth = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    language = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    credential_version = table.Column<int>(type: "integer", nullable: false),
                    expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_platform_push_subscriptions", x => x.id);
                    table.ForeignKey(
                        name: "FK_platform_push_subscriptions_platform_users_platform_user_id",
                        column: x => x.platform_user_id,
                        principalTable: "platform_users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "subscription_notices",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    period_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    change = table.Column<string>(type: "jsonb", nullable: true),
                    deadline = table.Column<DateOnly>(type: "date", nullable: true),
                    owner_acknowledged_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_subscription_notices", x => x.id);
                    table.ForeignKey(
                        name: "FK_subscription_notices_restaurant_subscription_periods_period~",
                        column: x => x.period_id,
                        principalTable: "restaurant_subscription_periods",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_subscription_notices_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "platform_subscription_receipts",
                columns: table => new
                {
                    notice_id = table.Column<Guid>(type: "uuid", nullable: false),
                    platform_user_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_platform_subscription_receipts", x => new { x.platform_user_id, x.notice_id });
                    table.ForeignKey(
                        name: "FK_platform_subscription_receipts_platform_users_platform_user~",
                        column: x => x.platform_user_id,
                        principalTable: "platform_users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_platform_subscription_receipts_subscription_notices_notice_~",
                        column: x => x.notice_id,
                        principalTable: "subscription_notices",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.AddCheckConstraint(
                name: "ck_restaurant_monthly_fee",
                table: "restaurants",
                sql: "default_monthly_fee_cents IS NULL OR default_monthly_fee_cents BETWEEN 1 AND 9007199254740991");

            migrationBuilder.AddCheckConstraint(
                name: "ck_subscription_period_monthly_fee",
                table: "restaurant_subscription_periods",
                sql: "monthly_fee_cents BETWEEN 1 AND 9007199254740991");

            migrationBuilder.AddCheckConstraint(
                name: "ck_subscription_period_months",
                table: "restaurant_subscription_periods",
                sql: "months BETWEEN 1 AND 119987");

            migrationBuilder.CreateIndex(
                name: "IX_platform_push_subscriptions_endpoint",
                table: "platform_push_subscriptions",
                column: "endpoint",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_platform_push_subscriptions_platform_user_id",
                table: "platform_push_subscriptions",
                column: "platform_user_id");

            migrationBuilder.CreateIndex(
                name: "IX_platform_subscription_receipts_notice_id",
                table: "platform_subscription_receipts",
                column: "notice_id");

            migrationBuilder.CreateIndex(
                name: "IX_subscription_notices_period_id_deadline_kind",
                table: "subscription_notices",
                columns: new[] { "period_id", "deadline", "kind" },
                unique: true,
                filter: "deadline IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_subscription_notices_restaurant_id",
                table: "subscription_notices",
                column: "restaurant_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "platform_push_subscriptions");

            migrationBuilder.DropTable(
                name: "platform_subscription_receipts");

            migrationBuilder.DropTable(
                name: "subscription_notices");

            // A rollback that needs billing history must restore the pre-upgrade backup.
            migrationBuilder.Sql("DELETE FROM restaurant_subscription_periods");
            migrationBuilder.Sql("UPDATE restaurants SET default_monthly_fee_cents = NULL WHERE default_monthly_fee_cents IS NOT NULL");

            migrationBuilder.DropCheckConstraint(
                name: "ck_restaurant_monthly_fee",
                table: "restaurants");

            migrationBuilder.DropCheckConstraint(
                name: "ck_subscription_period_monthly_fee",
                table: "restaurant_subscription_periods");

            migrationBuilder.DropCheckConstraint(
                name: "ck_subscription_period_months",
                table: "restaurant_subscription_periods");

            migrationBuilder.DropColumn(
                name: "monthly_fee_cents",
                table: "restaurant_subscription_periods");

            migrationBuilder.RenameColumn(
                name: "default_monthly_fee_cents",
                table: "restaurants",
                newName: "default_annual_fee_cents");

            migrationBuilder.RenameColumn(
                name: "months",
                table: "restaurant_subscription_periods",
                newName: "years");

            migrationBuilder.AddCheckConstraint(
                name: "ck_restaurant_annual_fee",
                table: "restaurants",
                sql: "default_annual_fee_cents IS NULL OR default_annual_fee_cents BETWEEN 0 AND 9007199254740991");

            migrationBuilder.AddCheckConstraint(
                name: "ck_subscription_period_years",
                table: "restaurant_subscription_periods",
                sql: "years BETWEEN 1 AND 9998");
        }
    }
}
