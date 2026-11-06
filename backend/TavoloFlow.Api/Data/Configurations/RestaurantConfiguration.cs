using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class RestaurantConfiguration : IEntityTypeConfiguration<Restaurant>
{
    public void Configure(EntityTypeBuilder<Restaurant> builder)
    {
        builder.ToTable(
            "restaurants",
            table =>
            {
                table.HasCheckConstraint(
                    "ck_restaurant_subscription_version",
                    "subscription_version > 0"
                );
                table.HasCheckConstraint(
                    "ck_restaurant_annual_fee",
                    "default_annual_fee_cents IS NULL OR default_annual_fee_cents BETWEEN 0 AND 9007199254740991"
                );
                table.HasCheckConstraint(
                    "ck_restaurant_default_language",
                    "default_language IN ('zh', 'it', 'en')"
                );
                table.HasCheckConstraint("ck_restaurant_currency", "currency_code = 'EUR'");
                table.HasCheckConstraint(
                    "ck_restaurant_service_status",
                    "service_status IN ('ACTIVE', 'SUSPENDED')"
                );
                table.HasCheckConstraint(
                    "ck_restaurant_google_maps_url",
                    "google_maps_url IS NULL OR google_maps_url LIKE 'https://%'"
                );
                table.HasCheckConstraint(
                    "ck_restaurant_theme",
                    "theme IN ('TERRACOTTA', 'LACQUER', 'INDIGO', 'INK', 'TARO')"
                );
            }
        );

        builder.HasKey(restaurant => restaurant.Id);
        builder.Property(restaurant => restaurant.Id).HasColumnName("id");

        builder
            .Property(restaurant => restaurant.Name)
            .HasColumnName("name")
            .HasMaxLength(InputRules.MaxRestaurantNameLength)
            .IsRequired();

        builder
            .Property(restaurant => restaurant.DefaultLanguage)
            .HasColumnName("default_language")
            .HasMaxLength(2)
            .IsRequired();

        builder
            .Property(restaurant => restaurant.TimeZone)
            .HasColumnName("time_zone")
            .HasMaxLength(64)
            .IsRequired()
            .HasDefaultValue("Europe/Rome")
            .ValueGeneratedNever();

        builder
            .Property(restaurant => restaurant.CurrencyCode)
            .HasColumnName("currency_code")
            .HasColumnType("character(3)")
            .IsRequired()
            .HasDefaultValue("EUR")
            .ValueGeneratedNever();

        builder
            .Property(restaurant => restaurant.ServiceStatus)
            .HasColumnName("service_status")
            .HasMaxLength(16)
            .HasConversion<UppercaseEnumConverter<RestaurantServiceStatus>>()
            .HasDefaultValue(RestaurantServiceStatus.Suspended)
            .ValueGeneratedNever();

        builder
            .Property(restaurant => restaurant.OrderingEnabled)
            .HasColumnName("ordering_enabled")
            .HasDefaultValue(false)
            .ValueGeneratedNever();

        builder
            .Property(restaurant => restaurant.JoinCodeRequired)
            .HasColumnName("join_code_required")
            .HasDefaultValue(true)
            .ValueGeneratedNever();

        builder
            .Property(restaurant => restaurant.Theme)
            .HasColumnName("theme")
            .HasMaxLength(16)
            .HasConversion<UppercaseEnumConverter<RestaurantTheme>>()
            .HasDefaultValue(RestaurantTheme.Terracotta)
            .ValueGeneratedNever();

        builder
            .Property(restaurant => restaurant.OwnerContact)
            .HasColumnName("owner_contact")
            .HasMaxLength(500);
        builder
            .Property(restaurant => restaurant.DefaultAnnualFeeCents)
            .HasColumnName("default_annual_fee_cents");
        builder
            .Property(restaurant => restaurant.SubscriptionVersion)
            .HasColumnName("subscription_version")
            .HasDefaultValue(1)
            .ValueGeneratedNever();

        builder
            .Property(restaurant => restaurant.CreatedAt)
            .HasColumnName("created_at")
            .HasColumnType("timestamptz")
            .HasDefaultValueSql("now()");

        builder
            .Property(restaurant => restaurant.GoogleMapsUrl)
            .HasColumnName("google_maps_url")
            .HasMaxLength(2048);
    }
}
