using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Menus;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class MenuCategoryConfiguration : IEntityTypeConfiguration<MenuCategory>
{
    public void Configure(EntityTypeBuilder<MenuCategory> builder)
    {
        builder.ToTable(
            "menu_categories",
            table =>
                table.HasCheckConstraint(
                    "ck_category_has_name",
                    "concat(name_zh, name_it, name_en) ~ '[^[:space:]]'"
                )
        );

        builder.HasKey(category => category.Id);

        builder
            .HasAlternateKey(category => new { category.Id, category.RestaurantId })
            .HasName("uq_categories_id_tenant");

        builder.Property(category => category.Id).HasColumnName("id");

        builder.Property(category => category.RestaurantId).HasColumnName("restaurant_id");

        builder
            .Property(category => category.NameZh)
            .HasColumnName("name_zh")
            .HasMaxLength(MenuValidation.MaxCategoryNameLength);
        builder
            .Property(category => category.NameIt)
            .HasColumnName("name_it")
            .HasMaxLength(MenuValidation.MaxCategoryNameLength);
        builder
            .Property(category => category.NameEn)
            .HasColumnName("name_en")
            .HasMaxLength(MenuValidation.MaxCategoryNameLength);

        builder
            .HasOne(category => category.Restaurant)
            .WithMany(restaurant => restaurant.MenuCategories)
            .HasForeignKey(category => category.RestaurantId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
