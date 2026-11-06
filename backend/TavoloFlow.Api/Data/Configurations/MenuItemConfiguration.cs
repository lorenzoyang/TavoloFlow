using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Menus;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class MenuItemConfiguration : IEntityTypeConfiguration<MenuItem>
{
    public void Configure(EntityTypeBuilder<MenuItem> builder)
    {
        builder.ToTable(
            "menu_items",
            table =>
            {
                table.HasCheckConstraint(
                    "ck_item_has_name",
                    "concat(name_zh, name_it, name_en) ~ '[^[:space:]]'"
                );
                table.HasCheckConstraint("ck_item_positive_price", "price_cents > 0");
            }
        );

        builder.HasKey(item => item.Id);

        builder
            .HasAlternateKey(item => new { item.Id, item.RestaurantId })
            .HasName("uq_menu_items_id_tenant");

        builder.Property(item => item.Id).HasColumnName("id");

        builder.Property(item => item.RestaurantId).HasColumnName("restaurant_id");

        builder.Property(item => item.CategoryId).HasColumnName("category_id");

        builder
            .Property(item => item.ItemCode)
            .HasColumnName("item_code")
            .HasMaxLength(MenuValidation.MaxItemCodeLength);

        builder
            .Property(item => item.NameZh)
            .HasColumnName("name_zh")
            .HasMaxLength(MenuValidation.MaxItemNameLength);
        builder
            .Property(item => item.NameIt)
            .HasColumnName("name_it")
            .HasMaxLength(MenuValidation.MaxItemNameLength);
        builder
            .Property(item => item.NameEn)
            .HasColumnName("name_en")
            .HasMaxLength(MenuValidation.MaxItemNameLength);

        builder
            .Property(item => item.DescriptionZh)
            .HasColumnName("description_zh")
            .HasColumnType("text");
        builder
            .Property(item => item.DescriptionIt)
            .HasColumnName("description_it")
            .HasColumnType("text");
        builder
            .Property(item => item.DescriptionEn)
            .HasColumnName("description_en")
            .HasColumnType("text");

        builder.Property(item => item.PriceCents).HasColumnName("price_cents");

        builder
            .Property(item => item.AllergenCodes)
            .HasColumnName("allergen_codes")
            .HasColumnType("text[]")
            .IsRequired()
            .HasDefaultValueSql("'{}'::text[]")
            .ValueGeneratedNever();

        builder
            .Property(item => item.AllergenReviewed)
            .HasColumnName("allergen_reviewed")
            .HasDefaultValue(false)
            .ValueGeneratedNever();

        builder
            .Property(item => item.IsAvailable)
            .HasColumnName("is_available")
            .HasDefaultValue(true)
            .ValueGeneratedNever();

        builder.Property(item => item.ImageId).HasColumnName("image_id");

        builder.HasIndex(item => new { item.RestaurantId, item.CategoryId });

        builder
            .HasIndex(item => new { item.RestaurantId, item.ItemCode })
            .IsUnique()
            .HasFilter("item_code IS NOT NULL")
            .HasDatabaseName("uq_menu_items_code");

        builder
            .HasOne(item => item.Restaurant)
            .WithMany(restaurant => restaurant.MenuItems)
            .HasForeignKey(item => item.RestaurantId)
            .OnDelete(DeleteBehavior.Cascade);

        builder
            .HasOne(item => item.Category)
            .WithMany(category => category.Items)
            .HasForeignKey(item => new { item.CategoryId, item.RestaurantId })
            .HasPrincipalKey(category => new { category.Id, category.RestaurantId })
            .OnDelete(DeleteBehavior.ClientNoAction);
    }
}
