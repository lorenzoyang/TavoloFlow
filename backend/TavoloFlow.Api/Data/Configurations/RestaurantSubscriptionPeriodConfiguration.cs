using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class RestaurantSubscriptionPeriodConfiguration
    : IEntityTypeConfiguration<RestaurantSubscriptionPeriod>
{
    public void Configure(EntityTypeBuilder<RestaurantSubscriptionPeriod> builder)
    {
        builder.ToTable(
            "restaurant_subscription_periods",
            table =>
            {
                table.HasCheckConstraint("ck_subscription_period_dates", "ends_on > starts_on");
                table.HasCheckConstraint(
                    "ck_subscription_period_years",
                    "years BETWEEN 1 AND 9998"
                );
                table.HasCheckConstraint(
                    "ck_subscription_period_amount",
                    "amount_cents BETWEEN 1 AND 9007199254740991"
                );
            }
        );
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).HasColumnName("id");
        builder.Property(p => p.RestaurantId).HasColumnName("restaurant_id");
        builder.Property(p => p.StartsOn).HasColumnName("starts_on").HasColumnType("date");
        builder.Property(p => p.EndsOn).HasColumnName("ends_on").HasColumnType("date");
        builder.Property(p => p.Years).HasColumnName("years");
        builder.Property(p => p.AmountCents).HasColumnName("amount_cents");
        builder.Property(p => p.PaidOn).HasColumnName("paid_on").HasColumnType("date");
        builder.Property(p => p.CreatedAt).HasColumnName("created_at").HasColumnType("timestamptz");
        builder.HasIndex(p => new { p.RestaurantId, p.StartsOn });
        builder
            .HasOne(p => p.Restaurant)
            .WithMany()
            .HasForeignKey(p => p.RestaurantId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
