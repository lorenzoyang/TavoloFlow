using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class OnlineCounterConfiguration : IEntityTypeConfiguration<OnlineCounter>
{
    public void Configure(EntityTypeBuilder<OnlineCounter> builder)
    {
        builder.ToTable(
            "online_counters",
            table => table.HasCheckConstraint("ck_online_counter_number", "last_number > 0")
        );
        builder.HasKey(counter => new { counter.RestaurantId, counter.BusinessDate });
        builder.Property(counter => counter.RestaurantId).HasColumnName("restaurant_id");
        builder
            .Property(counter => counter.BusinessDate)
            .HasColumnName("business_date")
            .HasColumnType("date");
        builder.Property(counter => counter.LastNumber).HasColumnName("last_number");
        builder
            .HasOne(counter => counter.Restaurant)
            .WithMany()
            .HasForeignKey(counter => counter.RestaurantId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
