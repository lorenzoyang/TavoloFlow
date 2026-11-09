using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Menus;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class MenuOptionConfiguration : IEntityTypeConfiguration<MenuOption>
{
    public void Configure(EntityTypeBuilder<MenuOption> builder)
    {
        builder.ToTable(
            "menu_options",
            table =>
            {
                table.HasCheckConstraint(
                    "ck_option_has_name",
                    "concat(name_zh, name_it, name_en) ~ '[^[:space:]]'"
                );
                table.HasCheckConstraint("ck_option_price_delta", "price_delta_cents >= 0");
            }
        );

        builder.HasKey(option => option.Id);

        builder.Property(option => option.Id).HasColumnName("id");

        builder.Property(option => option.RestaurantId).HasColumnName("restaurant_id");

        builder.Property(option => option.GroupId).HasColumnName("group_id");

        builder
            .Property(option => option.NameZh)
            .HasColumnName("name_zh")
            .HasMaxLength(MenuValidation.MaxOptionNameLength);
        builder
            .Property(option => option.NameIt)
            .HasColumnName("name_it")
            .HasMaxLength(MenuValidation.MaxOptionNameLength);
        builder
            .Property(option => option.NameEn)
            .HasColumnName("name_en")
            .HasMaxLength(MenuValidation.MaxOptionNameLength);

        builder.Property(option => option.PriceDeltaCents).HasColumnName("price_delta_cents");

        builder
            .Property(option => option.AllergenCodes)
            .HasColumnName("allergen_codes")
            .HasColumnType("text[]")
            .IsRequired()
            .HasDefaultValueSql("'{}'::text[]")
            .ValueGeneratedNever();

        builder
            .Property(option => option.IsAvailable)
            .HasColumnName("is_available")
            .HasDefaultValue(true)
            .ValueGeneratedNever();

        builder.Property(option => option.Position).HasColumnName("position");

        builder.HasIndex(option => option.RestaurantId);

        // The tenant is part of the key, so an option can never belong to another restaurant's group.
        builder
            .HasOne(option => option.Group)
            .WithMany(group => group.Options)
            .HasForeignKey(option => new { option.GroupId, option.RestaurantId })
            .HasPrincipalKey(group => new { group.Id, group.RestaurantId })
            .OnDelete(DeleteBehavior.Cascade);
    }
}
