using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Online;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class DeliveryTierConfiguration : IEntityTypeConfiguration<DeliveryTier>
{
    public void Configure(EntityTypeBuilder<DeliveryTier> builder)
    {
        builder.ToTable(
            "delivery_tiers",
            table =>
            {
                table.HasCheckConstraint(
                    "ck_delivery_tier_distance",
                    $"max_meters BETWEEN 1 AND {OnlineDelivery.MaxMeters}"
                );
                table.HasCheckConstraint(
                    "ck_delivery_tier_fee",
                    "fee_cents BETWEEN 0 AND 9007199254740991"
                );
            }
        );
        builder.HasKey(tier => new { tier.RestaurantId, tier.MaxMeters });
        builder.Property(tier => tier.RestaurantId).HasColumnName("restaurant_id");
        builder.Property(tier => tier.MaxMeters).HasColumnName("max_meters");
        builder.Property(tier => tier.FeeCents).HasColumnName("fee_cents");
        builder
            .HasOne(tier => tier.Restaurant)
            .WithMany()
            .HasForeignKey(tier => tier.RestaurantId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
