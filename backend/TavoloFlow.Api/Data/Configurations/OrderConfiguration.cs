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
            table.HasCheckConstraint("ck_order_status", "status IN ('NEW', 'PROCESSED')");
            table.HasCheckConstraint("ck_order_amount", "total_amount_cents >= 0");
            table.HasCheckConstraint("ck_order_language", "default_language_snapshot IN ('zh', 'it', 'en')");
            table.HasCheckConstraint("ck_order_lifecycle",
                "(status = 'NEW' AND processed_at IS NULL) OR (status = 'PROCESSED' AND processed_at IS NOT NULL)");
            table.HasCheckConstraint("ck_order_transition_times", "processed_at IS NULL OR processed_at >= created_at");
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

        builder.Property(order => order.DefaultLanguageSnapshot).HasColumnName("default_language_snapshot").HasMaxLength(2).IsRequired();

        builder.Property(order => order.CreatedAt).HasColumnName("created_at").HasColumnType("timestamptz").HasDefaultValueSql("now()");

        builder.Property(order => order.ProcessedAt).HasColumnName("processed_at").HasColumnType("timestamptz");

        builder.HasIndex(order => new { order.DiningSessionId, order.ClientRequestId }).IsUnique()
            .HasDatabaseName("uq_order_one_per_request");

        builder.HasIndex(order => new { order.RestaurantId, order.Status, order.CreatedAt, order.Id });
        builder.HasIndex(order => new { order.RestaurantId, order.Status, order.ProcessedAt, order.Id });

        builder.HasOne(order => order.Restaurant).WithMany(restaurant => restaurant.Orders)
            .HasForeignKey(order => order.RestaurantId).OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(order => order.DiningSession).WithMany(session => session.Orders)
            .HasForeignKey(order => new { order.DiningSessionId, order.RestaurantId })
            .HasPrincipalKey(session => new { session.Id, session.RestaurantId }).OnDelete(DeleteBehavior.Cascade);
    }
}
