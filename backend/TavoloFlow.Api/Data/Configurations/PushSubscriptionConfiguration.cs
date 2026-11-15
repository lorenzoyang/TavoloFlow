using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Push;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class PushSubscriptionConfiguration : IEntityTypeConfiguration<PushSubscription>
{
    public void Configure(EntityTypeBuilder<PushSubscription> builder)
    {
        builder.ToTable(
            "push_subscriptions",
            table =>
            {
                table.HasCheckConstraint(
                    "ck_push_subscription_credential_version",
                    "credential_version > 0"
                );
                table.HasCheckConstraint(
                    "ck_push_subscription_language",
                    "language IN ('zh', 'it', 'en')"
                );
            }
        );
        builder.HasKey(subscription => subscription.Id);
        builder.Property(subscription => subscription.Id).HasColumnName("id");
        builder.Property(subscription => subscription.RestaurantId).HasColumnName("restaurant_id");
        builder.Property(subscription => subscription.UserId).HasColumnName("user_id");
        builder
            .Property(subscription => subscription.Endpoint)
            .HasColumnName("endpoint")
            .HasMaxLength(PushEndpoints.MaxLength)
            .IsRequired();
        builder
            .Property(subscription => subscription.P256dh)
            .HasColumnName("p256dh")
            .HasMaxLength(PushEndpoints.MaxKeyLength)
            .IsRequired();
        builder
            .Property(subscription => subscription.Auth)
            .HasColumnName("auth")
            .HasMaxLength(PushEndpoints.MaxKeyLength)
            .IsRequired();
        builder
            .Property(subscription => subscription.CredentialVersion)
            .HasColumnName("credential_version");
        builder
            .Property(subscription => subscription.Language)
            .HasColumnName("language")
            .HasMaxLength(2)
            .IsRequired();
        builder
            .Property(subscription => subscription.ExpiresAt)
            .HasColumnName("expires_at")
            .HasColumnType("timestamptz");
        builder
            .Property(subscription => subscription.CreatedAt)
            .HasColumnName("created_at")
            .HasColumnType("timestamptz");
        builder
            .Property(subscription => subscription.UpdatedAt)
            .HasColumnName("updated_at")
            .HasColumnType("timestamptz");

        // A device has one row whoever signed in on it; registering upserts on this index.
        builder
            .HasIndex(subscription => subscription.Endpoint)
            .IsUnique()
            .HasDatabaseName("uq_push_subscription_endpoint");
        builder
            .HasIndex(subscription => subscription.RestaurantId)
            .HasDatabaseName("ix_push_subscriptions_restaurant");

        builder
            .HasOne(subscription => subscription.Restaurant)
            .WithMany()
            .HasForeignKey(subscription => subscription.RestaurantId)
            .OnDelete(DeleteBehavior.Cascade);
        // The composite key keeps the account inside the same restaurant.
        builder
            .HasOne(subscription => subscription.User)
            .WithMany()
            .HasForeignKey(subscription => new { subscription.UserId, subscription.RestaurantId })
            .HasPrincipalKey(user => new { user.Id, user.RestaurantId })
            .OnDelete(DeleteBehavior.Cascade);
    }
}
