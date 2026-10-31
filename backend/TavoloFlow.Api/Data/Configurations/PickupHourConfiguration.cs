using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class PickupHourConfiguration : IEntityTypeConfiguration<PickupHour>
{
    public void Configure(EntityTypeBuilder<PickupHour> builder)
    {
        builder.ToTable("pickup_hours", table =>
        {
            table.HasCheckConstraint("ck_pickup_hour_weekday", "weekday BETWEEN 1 AND 7");
            table.HasCheckConstraint("ck_pickup_hour_slot", "slot IN (1, 2)");
            // Windows never cross midnight; the latest end is 24:00.
            table.HasCheckConstraint("ck_pickup_hour_window", "opens_minute >= 0 AND opens_minute < closes_minute AND closes_minute <= 1440");
        });

        builder.HasKey(hour => new { hour.RestaurantId, hour.Weekday, hour.Slot });

        builder.Property(hour => hour.RestaurantId).HasColumnName("restaurant_id");
        builder.Property(hour => hour.Weekday).HasColumnName("weekday");
        builder.Property(hour => hour.Slot).HasColumnName("slot");
        builder.Property(hour => hour.OpensMinute).HasColumnName("opens_minute");
        builder.Property(hour => hour.ClosesMinute).HasColumnName("closes_minute");

        builder.HasOne(hour => hour.Restaurant).WithMany(restaurant => restaurant.PickupHours)
            .HasForeignKey(hour => hour.RestaurantId).OnDelete(DeleteBehavior.Cascade);
    }
}
