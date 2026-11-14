using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class OnlineHourConfiguration : IEntityTypeConfiguration<OnlineHour>
{
    public void Configure(EntityTypeBuilder<OnlineHour> builder)
    {
        builder.ToTable(
            "online_hours",
            table =>
            {
                table.HasCheckConstraint("ck_online_hour_weekday", "weekday BETWEEN 1 AND 7");
                table.HasCheckConstraint("ck_online_hour_slot", "slot IN (1, 2)");
                // A slot never crosses midnight; 1440 closes at the end of the day.
                table.HasCheckConstraint(
                    "ck_online_hour_minutes",
                    "opens_minute >= 0 AND opens_minute < closes_minute AND closes_minute <= 1440"
                );
            }
        );
        builder.HasKey(hour => new
        {
            hour.RestaurantId,
            hour.Weekday,
            hour.Slot,
        });
        builder.Property(hour => hour.RestaurantId).HasColumnName("restaurant_id");
        builder.Property(hour => hour.Weekday).HasColumnName("weekday");
        builder.Property(hour => hour.Slot).HasColumnName("slot");
        builder.Property(hour => hour.OpensMinute).HasColumnName("opens_minute");
        builder.Property(hour => hour.ClosesMinute).HasColumnName("closes_minute");
        builder
            .HasOne(hour => hour.Restaurant)
            .WithMany()
            .HasForeignKey(hour => hour.RestaurantId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
