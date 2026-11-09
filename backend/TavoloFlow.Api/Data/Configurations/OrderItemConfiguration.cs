using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Menus;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class OrderItemConfiguration : IEntityTypeConfiguration<OrderItem>
{
    public void Configure(EntityTypeBuilder<OrderItem> builder)
    {
        builder.ToTable(
            "order_items",
            table =>
            {
                table.HasCheckConstraint(
                    "ck_order_item_has_name",
                    "concat(name_zh_snapshot, name_it_snapshot, name_en_snapshot) ~ '[^[:space:]]'"
                );
                table.HasCheckConstraint("ck_order_item_unit_price", "unit_price_cents >= 0");
                table.HasCheckConstraint("ck_order_item_quantity", "quantity > 0");
                table.HasCheckConstraint(
                    "ck_order_item_status",
                    "status IN ('NEW', 'READY', 'CANCELLED')"
                );
                // Migrated cancellations may retain a prior ready_at; new writes only transition from NEW.
                table.HasCheckConstraint(
                    "ck_order_item_lifecycle",
                    "(status = 'NEW' AND ready_at IS NULL AND cancelled_at IS NULL) OR "
                        + "(status = 'READY' AND ready_at IS NOT NULL AND cancelled_at IS NULL) OR "
                        + "(status = 'CANCELLED' AND cancelled_at IS NOT NULL AND (ready_at IS NULL OR cancelled_at >= ready_at))"
                );
                table.HasCheckConstraint(
                    "ck_order_item_options",
                    "jsonb_typeof(options_snapshot) = 'array'"
                );
                table.HasCheckConstraint(
                    "ck_order_item_served",
                    "served_at IS NULL OR (status = 'READY' AND served_at >= ready_at)"
                );
            }
        );

        builder.HasKey(item => item.Id);

        builder.Property(item => item.Id).HasColumnName("id");

        builder.Property(item => item.RestaurantId).HasColumnName("restaurant_id");

        builder.Property(item => item.OrderId).HasColumnName("order_id");

        builder.Property(item => item.MenuItemId).HasColumnName("menu_item_id");

        builder
            .Property(item => item.ItemCodeSnapshot)
            .HasColumnName("item_code_snapshot")
            .HasMaxLength(MenuValidation.MaxItemCodeLength);

        builder
            .Property(item => item.NameZhSnapshot)
            .HasColumnName("name_zh_snapshot")
            .HasMaxLength(MenuValidation.MaxItemNameLength);
        builder
            .Property(item => item.NameItSnapshot)
            .HasColumnName("name_it_snapshot")
            .HasMaxLength(MenuValidation.MaxItemNameLength);
        builder
            .Property(item => item.NameEnSnapshot)
            .HasColumnName("name_en_snapshot")
            .HasMaxLength(MenuValidation.MaxItemNameLength);

        builder
            .Property(item => item.AllergenCodesSnapshot)
            .HasColumnName("allergen_codes_snapshot")
            .HasColumnType("text[]")
            .IsRequired()
            .HasDefaultValueSql("'{}'::text[]")
            .ValueGeneratedNever();

        builder.Property(item => item.UnitPriceCents).HasColumnName("unit_price_cents");

        builder.Property(item => item.Quantity).HasColumnName("quantity");

        builder.Property(item => item.Remark).HasColumnName("remark").HasColumnType("text");

        builder.ComplexCollection(
            item => item.OptionsSnapshot,
            options =>
            {
                options.ToJson("options_snapshot");
                options.Property(option => option.GroupNameZh).HasJsonPropertyName("groupNameZh");
                options.Property(option => option.GroupNameIt).HasJsonPropertyName("groupNameIt");
                options.Property(option => option.GroupNameEn).HasJsonPropertyName("groupNameEn");
                options.Property(option => option.NameZh).HasJsonPropertyName("nameZh");
                options.Property(option => option.NameIt).HasJsonPropertyName("nameIt");
                options.Property(option => option.NameEn).HasJsonPropertyName("nameEn");
                options
                    .Property(option => option.PriceDeltaCents)
                    .HasJsonPropertyName("priceDeltaCents");
            }
        );

        builder
            .Property(item => item.Status)
            .HasColumnName("status")
            .HasMaxLength(12)
            .HasConversion<UppercaseEnumConverter<OrderItemStatus>>()
            .HasDefaultValue(OrderItemStatus.New)
            .ValueGeneratedNever();
        builder
            .Property(item => item.ReadyAt)
            .HasColumnName("ready_at")
            .HasColumnType("timestamptz");
        builder
            .Property(item => item.CancelledAt)
            .HasColumnName("cancelled_at")
            .HasColumnType("timestamptz");
        builder
            .Property(item => item.ServedAt)
            .HasColumnName("served_at")
            .HasColumnType("timestamptz");

        builder.HasIndex(item => new { item.OrderId, item.RestaurantId });
        // Explicit, because EF would otherwise treat the partial index below as covering this foreign key.
        builder.HasIndex(item => item.RestaurantId);
        // The pass queue and its newest-ready watermark.
        builder
            .HasIndex(item => new
            {
                item.RestaurantId,
                item.ReadyAt,
                item.Id,
            })
            .HasFilter("status = 'READY' AND served_at IS NULL");

        builder
            .HasOne(item => item.Restaurant)
            .WithMany(restaurant => restaurant.OrderItems)
            .HasForeignKey(item => item.RestaurantId)
            .OnDelete(DeleteBehavior.Cascade);

        builder
            .HasOne(item => item.Order)
            .WithMany(order => order.Items)
            .HasForeignKey(item => new { item.OrderId, item.RestaurantId })
            .HasPrincipalKey(order => new { order.Id, order.RestaurantId })
            .OnDelete(DeleteBehavior.Cascade);

        builder
            .HasOne(item => item.MenuItem)
            .WithMany()
            .HasForeignKey(item => new { item.MenuItemId, item.RestaurantId })
            .HasPrincipalKey(menuItem => new { menuItem.Id, menuItem.RestaurantId })
            .OnDelete(DeleteBehavior.ClientNoAction);
    }
}
