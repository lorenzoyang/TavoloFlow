using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class RestaurantConfiguration : IEntityTypeConfiguration<Restaurant>
{
    public void Configure(EntityTypeBuilder<Restaurant> builder)
    {
        builder.ToTable("restaurants", table =>
        {
            table.HasCheckConstraint("ck_restaurant_default_language", "default_language IN ('zh', 'it', 'en')");
            table.HasCheckConstraint("ck_restaurant_currency", "currency_code = 'EUR'");
            table.HasCheckConstraint("ck_restaurant_service_status", "service_status IN ('ACTIVE', 'SUSPENDED')");
        });

        builder.HasKey(restaurant => restaurant.Id);
        builder.Property(restaurant => restaurant.Id).HasColumnName("id");

        builder.Property(restaurant => restaurant.Name).HasColumnName("name").HasMaxLength(150).IsRequired();

        builder.Property(restaurant => restaurant.DefaultLanguage).HasColumnName("default_language").HasMaxLength(2).IsRequired();

        builder.Property(restaurant => restaurant.TimeZone).HasColumnName("time_zone").HasMaxLength(64).IsRequired()
            .HasDefaultValue("Europe/Rome").ValueGeneratedNever();

        builder.Property(restaurant => restaurant.CurrencyCode).HasColumnName("currency_code").HasColumnType("character(3)").IsRequired()
            .HasDefaultValue("EUR").ValueGeneratedNever();

        builder.Property(restaurant => restaurant.ServiceStatus).HasColumnName("service_status").HasMaxLength(16)
            .HasConversion<UppercaseEnumConverter<RestaurantServiceStatus>>()
            .HasDefaultValue(RestaurantServiceStatus.Suspended).ValueGeneratedNever();

        builder.Property(restaurant => restaurant.OrderingEnabled).HasColumnName("ordering_enabled").HasDefaultValue(false).ValueGeneratedNever();
        
        builder.Property(restaurant => restaurant.CreatedAt).HasColumnName("created_at").HasColumnType("timestamptz").HasDefaultValueSql("now()");
    }
}
