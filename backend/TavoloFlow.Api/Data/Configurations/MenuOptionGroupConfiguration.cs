using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Menus;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class MenuOptionGroupConfiguration : IEntityTypeConfiguration<MenuOptionGroup>
{
    public void Configure(EntityTypeBuilder<MenuOptionGroup> builder)
    {
        builder.ToTable(
            "menu_option_groups",
            table =>
            {
                table.HasCheckConstraint(
                    "ck_option_group_has_name",
                    "concat(name_zh, name_it, name_en) ~ '[^[:space:]]'"
                );
                table.HasCheckConstraint(
                    "ck_option_group_selection",
                    "min_select >= 0 AND max_select >= 1 AND min_select <= max_select"
                );
            }
        );

        builder.HasKey(group => group.Id);

        builder
            .HasAlternateKey(group => new { group.Id, group.RestaurantId })
            .HasName("uq_option_groups_id_tenant");

        builder.Property(group => group.Id).HasColumnName("id");

        builder.Property(group => group.RestaurantId).HasColumnName("restaurant_id");

        builder
            .Property(group => group.NameZh)
            .HasColumnName("name_zh")
            .HasMaxLength(MenuValidation.MaxOptionNameLength);
        builder
            .Property(group => group.NameIt)
            .HasColumnName("name_it")
            .HasMaxLength(MenuValidation.MaxOptionNameLength);
        builder
            .Property(group => group.NameEn)
            .HasColumnName("name_en")
            .HasMaxLength(MenuValidation.MaxOptionNameLength);

        builder.Property(group => group.MinSelect).HasColumnName("min_select");

        builder.Property(group => group.MaxSelect).HasColumnName("max_select");

        builder.Property(group => group.Position).HasColumnName("position");

        builder.HasIndex(group => new { group.RestaurantId, group.Position });

        builder
            .HasOne(group => group.Restaurant)
            .WithMany()
            .HasForeignKey(group => group.RestaurantId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
