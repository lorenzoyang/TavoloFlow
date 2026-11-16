using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class OnlineSubmissionSources : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "browser_key",
                table: "online_requests",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ip_key",
                table: "online_requests",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_online_request_source",
                table: "online_requests",
                sql: "(browser_key IS NULL AND ip_key IS NULL) OR (browser_key IS NOT NULL AND ip_key IS NOT NULL AND browser_key ~ '^[0-9a-f]{64}$' AND ip_key ~ '^[0-9a-f]{64}$')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_online_request_source",
                table: "online_requests");

            migrationBuilder.DropColumn(
                name: "browser_key",
                table: "online_requests");

            migrationBuilder.DropColumn(
                name: "ip_key",
                table: "online_requests");
        }
    }
}
