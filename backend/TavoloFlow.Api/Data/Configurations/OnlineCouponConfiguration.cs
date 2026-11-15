using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Online;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class OnlineCouponConfiguration : IEntityTypeConfiguration<OnlineCoupon>
{
    public void Configure(EntityTypeBuilder<OnlineCoupon> builder)
    {
        builder.ToTable(
            "online_coupons",
            table =>
            {
                table.HasCheckConstraint("ck_online_coupon_code", "code ~ '^[A-Z0-9]{3,20}$'");
                table.HasCheckConstraint(
                    "ck_online_coupon_percent",
                    $"percent_off BETWEEN {OnlineCoupons.MinPercent} AND {OnlineCoupons.MaxPercent}"
                );
            }
        );
        builder.HasKey(coupon => coupon.Id);
        builder.Property(coupon => coupon.Id).HasColumnName("id");
        builder.Property(coupon => coupon.RestaurantId).HasColumnName("restaurant_id");
        builder
            .Property(coupon => coupon.Code)
            .HasColumnName("code")
            .HasMaxLength(OnlineCoupons.MaxCodeLength);
        builder.Property(coupon => coupon.PercentOff).HasColumnName("percent_off");
        builder
            .Property(coupon => coupon.ValidUntil)
            .HasColumnName("valid_until")
            .HasColumnType("date");
        builder
            .HasIndex(coupon => new { coupon.RestaurantId, coupon.Code })
            .IsUnique()
            .HasDatabaseName("uq_online_coupon_code");
        builder
            .HasOne(coupon => coupon.Restaurant)
            .WithMany()
            .HasForeignKey(coupon => coupon.RestaurantId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
