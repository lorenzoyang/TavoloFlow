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
            table.HasCheckConstraint("ck_restaurant_subscription_version", "subscription_version > 0");
            table.HasCheckConstraint("ck_restaurant_annual_fee", "default_annual_fee_cents IS NULL OR default_annual_fee_cents BETWEEN 0 AND 9007199254740991");
            table.HasCheckConstraint("ck_restaurant_default_language", "default_language IN ('zh', 'it', 'en')");
            table.HasCheckConstraint("ck_restaurant_currency", "currency_code = 'EUR'");
            table.HasCheckConstraint("ck_restaurant_service_status", "service_status IN ('ACTIVE', 'SUSPENDED')");
            table.HasCheckConstraint("ck_restaurant_google_maps_url", "google_maps_url IS NULL OR google_maps_url LIKE 'https://%'");
            table.HasCheckConstraint("ck_restaurant_theme", "theme IN ('TERRACOTTA', 'LACQUER', 'INDIGO', 'INK', 'TARO')");
            table.HasCheckConstraint("ck_restaurant_services", "dine_in_enabled OR pickup_enabled");
            // The same rules as InputRules.NormalizePhone and InputRules.IsSlug.
            table.HasCheckConstraint("ck_restaurant_phone", "phone IS NULL OR phone ~ '^\\+?[0-9]{6,15}$'");
            table.HasCheckConstraint("ck_restaurant_slug", "slug IS NULL OR slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'");
            table.HasCheckConstraint("ck_restaurant_pickup_contact", "NOT pickup_enabled OR (phone IS NOT NULL AND slug IS NOT NULL)");
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

        builder.Property(restaurant => restaurant.JoinCodeRequired).HasColumnName("join_code_required").HasDefaultValue(true).ValueGeneratedNever();

        builder.Property(restaurant => restaurant.DineInEnabled).HasColumnName("dine_in_enabled").HasDefaultValue(true).ValueGeneratedNever();

        builder.Property(restaurant => restaurant.PickupEnabled).HasColumnName("pickup_enabled").HasDefaultValue(false).ValueGeneratedNever();

        builder.Property(restaurant => restaurant.Phone).HasColumnName("phone").HasMaxLength(16);

        builder.Property(restaurant => restaurant.Slug).HasColumnName("slug").HasMaxLength(40);

        builder.Property(restaurant => restaurant.PickupPaused).HasColumnName("pickup_paused").HasDefaultValue(false).ValueGeneratedNever();

        builder.HasIndex(restaurant => restaurant.Slug).IsUnique().HasDatabaseName("uq_restaurant_slug");

        builder.Property(restaurant => restaurant.Theme).HasColumnName("theme").HasMaxLength(16)
            .HasConversion<UppercaseEnumConverter<RestaurantTheme>>()
            .HasDefaultValue(RestaurantTheme.Terracotta).ValueGeneratedNever();
        
        builder.Property(restaurant => restaurant.OwnerContact).HasColumnName("owner_contact").HasMaxLength(500);
        builder.Property(restaurant => restaurant.DefaultAnnualFeeCents).HasColumnName("default_annual_fee_cents");
        builder.Property(restaurant => restaurant.SubscriptionVersion).HasColumnName("subscription_version").HasDefaultValue(1).ValueGeneratedNever();

        builder.Property(restaurant => restaurant.CreatedAt).HasColumnName("created_at").HasColumnType("timestamptz").HasDefaultValueSql("now()");

        builder.Property(restaurant => restaurant.GoogleMapsUrl).HasColumnName("google_maps_url").HasMaxLength(2048);
    }
}
