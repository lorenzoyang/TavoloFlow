using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class MenuItemImageConfiguration : IEntityTypeConfiguration<MenuItemImage>
{
    public void Configure(EntityTypeBuilder<MenuItemImage> builder)
    {
        builder.ToTable("menu_item_images");

        builder.HasKey(image => image.Id);

        builder.Property(image => image.Id).HasColumnName("id").ValueGeneratedNever();

        builder.Property(image => image.MenuItemId).HasColumnName("menu_item_id");

        builder.Property(image => image.Content).HasColumnName("content").HasColumnType("bytea");

        // At most one photo per dish. menu_items.image_id has no reverse FK, which would make the two tables
        // reference each other; MenuService replaces both sides in one transaction instead.
        builder.HasIndex(image => image.MenuItemId).IsUnique();

        // Deleting a dish (CatalogDeletionService) removes its photo; order snapshots never reference it.
        builder
            .HasOne<MenuItem>()
            .WithOne()
            .HasForeignKey<MenuItemImage>(image => image.MenuItemId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
