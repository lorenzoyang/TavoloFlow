using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class OrderConfiguration : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.ToTable("orders", table =>
        {
            table.HasCheckConstraint("ck_order_status", "status IN ('NEW', 'READY', 'CANCELLED')");
            table.HasCheckConstraint("ck_order_amount", "total_amount_cents >= 0");
            table.HasCheckConstraint("ck_order_language", "default_language_snapshot IN ('zh', 'it', 'en')");
            table.HasCheckConstraint("ck_order_lifecycle",
                "(status = 'NEW' AND ready_at IS NULL AND cancelled_at IS NULL AND cancel_reason IS NULL) OR " +
                "(status = 'READY' AND ready_at IS NOT NULL AND cancelled_at IS NULL AND cancel_reason IS NULL) OR " +
                "(status = 'CANCELLED' AND cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL AND cancel_reason ~ '[^[:space:]]')");
            table.HasCheckConstraint("ck_order_transition_times",
                "(ready_at IS NULL OR ready_at >= created_at) AND " +
                "(cancelled_at IS NULL OR cancelled_at >= created_at) AND " +
                "(ready_at IS NULL OR cancelled_at IS NULL OR cancelled_at >= ready_at)");
        });

        builder.HasKey(order => order.Id);

        builder.HasAlternateKey(order => new { order.Id, order.RestaurantId }).HasName("uq_orders_id_tenant");

        builder.Property(order => order.Id).HasColumnName("id");

        builder.Property(order => order.RestaurantId).HasColumnName("restaurant_id");

        builder.Property(order => order.DiningSessionId).HasColumnName("dining_session_id");

        builder.Property(order => order.ClientRequestId).HasColumnName("client_request_id");

        builder.Property(order => order.Status).HasColumnName("status").HasMaxLength(12)
            .HasConversion<UppercaseEnumConverter<OrderStatus>>()
            .HasDefaultValue(OrderStatus.New).ValueGeneratedNever();

        builder.Property(order => order.TotalAmountCents).HasColumnName("total_amount_cents");

        builder.Property(order => order.OrderNote).HasColumnName("order_note").HasColumnType("text");

        builder.Property(order => order.DefaultLanguageSnapshot).HasColumnName("default_language_snapshot").HasMaxLength(2).IsRequired();

        builder.Property(order => order.CreatedAt).HasColumnName("created_at").HasColumnType("timestamptz").HasDefaultValueSql("now()");

        builder.Property(order => order.ReadyAt).HasColumnName("ready_at").HasColumnType("timestamptz");

        builder.Property(order => order.CancelledAt).HasColumnName("cancelled_at").HasColumnType("timestamptz");

        builder.Property(order => order.CancelReason).HasColumnName("cancel_reason").HasColumnType("text");

        builder.HasIndex(order => new { order.DiningSessionId, order.ClientRequestId }).IsUnique()
            .HasDatabaseName("uq_order_one_per_request");

        builder.HasIndex(order => new { order.RestaurantId, order.Status, order.CreatedAt });

        builder.HasOne(order => order.Restaurant).WithMany(restaurant => restaurant.Orders)
            .HasForeignKey(order => order.RestaurantId).OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(order => order.DiningSession).WithMany(session => session.Orders)
            .HasForeignKey(order => new { order.DiningSessionId, order.RestaurantId })
            .HasPrincipalKey(session => new { session.Id, session.RestaurantId }).OnDelete(DeleteBehavior.Cascade);
    }
}
