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
                table.HasCheckConstraint(
                    "ck_restaurant_services",
                    "dine_in_enabled OR online_enabled"
                );
                table.HasCheckConstraint(
                    "ck_restaurant_online_slug",
                    "NOT online_enabled OR slug IS NOT NULL"
                );
                // InputRules.NormalizePhone stores only an optional + and 6-15 digits.
                table.HasCheckConstraint(
                    "ck_restaurant_public_phone",
                    "public_phone IS NULL OR public_phone ~ '^\\+?[0-9]{6,15}$'"
                );
                table.HasCheckConstraint(
                    "ck_restaurant_delivery_origin",
                    "(delivery_origin_lat IS NULL AND delivery_origin_lng IS NULL) OR "
                        + "(delivery_origin_lat IS NOT NULL AND delivery_origin_lng IS NOT NULL AND "
                        + "delivery_origin_lat BETWEEN -90 AND 90 AND delivery_origin_lng BETWEEN -180 AND 180)"
                );
                // Delivery needs its starting point; at least one tier is checked by the settings write.
                table.HasCheckConstraint(
                    "ck_restaurant_delivery_ready",
                    "NOT delivery_enabled OR delivery_origin_lat IS NOT NULL"
                );
                table.HasCheckConstraint(
                    "ck_restaurant_delivery_min_order",
                    "delivery_min_order_cents IS NULL OR delivery_min_order_cents BETWEEN 1 AND 9007199254740991"
                );
                // InputRules.IsSlug: 3-40 lowercase letters, digits and hyphens, no hyphen at either end.
                table.HasCheckConstraint(
                    "ck_restaurant_slug",
                    "slug IS NULL OR slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'"
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
            .Property(restaurant => restaurant.DineInEnabled)
            .HasColumnName("dine_in_enabled")
            .HasDefaultValue(true)
            .ValueGeneratedNever();

        builder
            .Property(restaurant => restaurant.OnlineEnabled)
            .HasColumnName("online_enabled")
            .HasDefaultValue(false)
            .ValueGeneratedNever();

        builder
            .Property(restaurant => restaurant.Slug)
            .HasColumnName("slug")
            .HasMaxLength(InputRules.MaxSlugLength);
        builder
            .HasIndex(restaurant => restaurant.Slug)
            .IsUnique()
            .HasDatabaseName(InputRules.SlugIndex);

        builder
            .Property(restaurant => restaurant.PublicPhone)
            .HasColumnName("public_phone")
            .HasMaxLength(16);
        builder
            .Property(restaurant => restaurant.OnlinePausedUntil)
            .HasColumnName("online_paused_until")
            .HasColumnType("timestamptz");

        builder
            .Property(restaurant => restaurant.DeliveryEnabled)
            .HasColumnName("delivery_enabled")
            .HasDefaultValue(false)
            .ValueGeneratedNever();
        builder
            .Property(restaurant => restaurant.DeliveryNoteZh)
            .HasColumnName("delivery_note_zh")
            .HasMaxLength(InputRules.MaxDeliveryNoteLength);
        builder
            .Property(restaurant => restaurant.DeliveryNoteIt)
            .HasColumnName("delivery_note_it")
            .HasMaxLength(InputRules.MaxDeliveryNoteLength);
        builder
            .Property(restaurant => restaurant.DeliveryNoteEn)
            .HasColumnName("delivery_note_en")
            .HasMaxLength(InputRules.MaxDeliveryNoteLength);
        builder
            .Property(restaurant => restaurant.DeliveryMinOrderCents)
            .HasColumnName("delivery_min_order_cents");
        builder
            .Property(restaurant => restaurant.DeliveryOriginLat)
            .HasColumnName("delivery_origin_lat")
            .HasPrecision(8, 6);
        builder
            .Property(restaurant => restaurant.DeliveryOriginLng)
            .HasColumnName("delivery_origin_lng")
            .HasPrecision(9, 6);

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
