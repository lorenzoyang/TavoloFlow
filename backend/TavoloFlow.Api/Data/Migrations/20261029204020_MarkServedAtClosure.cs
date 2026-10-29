using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TavoloFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class MarkServedAtClosure : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Closure now marks a visit's remaining READY items served; apply the same rule to visits closed
            // before it, so they leave the pass queue's partial index.
            migrationBuilder.Sql("""
                UPDATE order_items AS i SET served_at = GREATEST(s.closed_at, i.ready_at)
                FROM orders AS o
                JOIN dining_sessions AS s ON s.id = o.dining_session_id AND s.restaurant_id = o.restaurant_id
                WHERE o.id = i.order_id AND o.restaurant_id = i.restaurant_id
                  AND s.status = 'CLOSED' AND i.status = 'READY' AND i.served_at IS NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Data only: which items were stamped at closure is not recorded, so nothing is reverted.
        }
    }
}
