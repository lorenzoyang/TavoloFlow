using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class MenuItemOptionGroupConfiguration
    : IEntityTypeConfiguration<MenuItemOptionGroup>
{
    public void Configure(EntityTypeBuilder<MenuItemOptionGroup> builder)
    {
        builder.ToTable("menu_item_option_groups");

        builder.HasKey(link => new { link.MenuItemId, link.GroupId });

        builder.Property(link => link.MenuItemId).HasColumnName("menu_item_id");

        builder.Property(link => link.GroupId).HasColumnName("group_id");

        builder.Property(link => link.RestaurantId).HasColumnName("restaurant_id");

        builder.HasIndex(link => link.RestaurantId);

        // Deleting a dish (CatalogDeletionService) or a group removes its links in the database;
        // both keys include the tenant, so a link never joins two restaurants.
        builder
            .HasOne<MenuItem>()
            .WithMany()
            .HasForeignKey(link => new { link.MenuItemId, link.RestaurantId })
            .HasPrincipalKey(item => new { item.Id, item.RestaurantId })
            .OnDelete(DeleteBehavior.Cascade);

        builder
            .HasOne<MenuOptionGroup>()
            .WithMany()
            .HasForeignKey(link => new { link.GroupId, link.RestaurantId })
            .HasPrincipalKey(group => new { group.Id, group.RestaurantId })
            .OnDelete(DeleteBehavior.Cascade);
    }
}
