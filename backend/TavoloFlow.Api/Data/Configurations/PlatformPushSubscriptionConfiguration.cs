using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Push;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class PlatformPushSubscriptionConfiguration
    : IEntityTypeConfiguration<PlatformPushSubscription>
{
    public void Configure(EntityTypeBuilder<PlatformPushSubscription> builder)
    {
        builder.ToTable("platform_push_subscriptions");
        builder.HasKey(s => s.Id);
        builder.Property(s => s.Id).HasColumnName("id");
        builder.Property(s => s.PlatformUserId).HasColumnName("platform_user_id");
        builder
            .Property(s => s.Endpoint)
            .HasColumnName("endpoint")
            .HasMaxLength(PushEndpoints.MaxLength);
        builder
            .Property(s => s.P256dh)
            .HasColumnName("p256dh")
            .HasMaxLength(PushEndpoints.MaxKeyLength);
        builder
            .Property(s => s.Auth)
            .HasColumnName("auth")
            .HasMaxLength(PushEndpoints.MaxKeyLength);
        builder.Property(s => s.Language).HasColumnName("language").HasMaxLength(2);
        builder.Property(s => s.CredentialVersion).HasColumnName("credential_version");
        builder.Property(s => s.ExpiresAt).HasColumnName("expires_at");
        builder.HasOne(s => s.User).WithMany().HasForeignKey(s => s.PlatformUserId);
        builder.HasIndex(s => s.Endpoint).IsUnique();
    }
}
