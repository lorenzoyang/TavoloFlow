using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class OrderItemConfiguration : IEntityTypeConfiguration<OrderItem>
{
    public void Configure(EntityTypeBuilder<OrderItem> builder)
    {
        builder.ToTable("order_items", table =>
        {
            table.HasCheckConstraint("ck_order_item_has_name", "concat(name_zh_snapshot, name_it_snapshot, name_en_snapshot) ~ '[^[:space:]]'");
            table.HasCheckConstraint("ck_order_item_unit_price", "unit_price_cents >= 0");
            table.HasCheckConstraint("ck_order_item_quantity", "quantity > 0");
        });

        builder.HasKey(item => item.Id);

        builder.Property(item => item.Id).HasColumnName("id");

        builder.Property(item => item.RestaurantId).HasColumnName("restaurant_id");

        builder.Property(item => item.OrderId).HasColumnName("order_id");

        builder.Property(item => item.MenuItemId).HasColumnName("menu_item_id");

        builder.Property(item => item.ItemCodeSnapshot).HasColumnName("item_code_snapshot").HasMaxLength(40);

        builder.Property(item => item.NameZhSnapshot).HasColumnName("name_zh_snapshot").HasMaxLength(150);
        builder.Property(item => item.NameItSnapshot).HasColumnName("name_it_snapshot").HasMaxLength(150);
        builder.Property(item => item.NameEnSnapshot).HasColumnName("name_en_snapshot").HasMaxLength(150);

        builder.Property(item => item.AllergenCodesSnapshot).HasColumnName("allergen_codes_snapshot").HasColumnType("text[]").IsRequired()
            .HasDefaultValueSql("'{}'::text[]").ValueGeneratedNever();

        builder.Property(item => item.UnitPriceCents).HasColumnName("unit_price_cents");

        builder.Property(item => item.Quantity).HasColumnName("quantity");

        builder.Property(item => item.Remark).HasColumnName("remark").HasColumnType("text");

        builder.HasIndex(item => new { item.OrderId, item.RestaurantId });

        builder.HasOne(item => item.Restaurant).WithMany(restaurant => restaurant.OrderItems)
            .HasForeignKey(item => item.RestaurantId).OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(item => item.Order).WithMany(order => order.Items)
            .HasForeignKey(item => new { item.OrderId, item.RestaurantId })
            .HasPrincipalKey(order => new { order.Id, order.RestaurantId }).OnDelete(DeleteBehavior.Cascade);
            
        builder.HasOne(item => item.MenuItem).WithMany()
            .HasForeignKey(item => new { item.MenuItemId, item.RestaurantId })
            .HasPrincipalKey(menuItem => new { menuItem.Id, menuItem.RestaurantId }).OnDelete(DeleteBehavior.ClientNoAction);
    }
}
