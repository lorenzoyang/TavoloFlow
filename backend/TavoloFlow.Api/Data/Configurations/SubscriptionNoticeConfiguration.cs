using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Common;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class SubscriptionNoticeConfiguration : IEntityTypeConfiguration<SubscriptionNotice>
{
    public void Configure(EntityTypeBuilder<SubscriptionNotice> builder)
    {
        builder.ToTable("subscription_notices");
        builder.HasKey(n => n.Id);
        builder.Property(n => n.Id).HasColumnName("id");
        builder.Property(n => n.RestaurantId).HasColumnName("restaurant_id");
        builder.Property(n => n.PeriodId).HasColumnName("period_id");
        builder
            .Property(n => n.Kind)
            .HasColumnName("kind")
            .HasConversion(
                kind => ApiEnum.Text(kind),
                text => ApiEnum.Parse<SubscriptionNoticeKind>(text)
            );
        builder.Property(n => n.CreatedAt).HasColumnName("created_at");
        builder.Property(n => n.Reason).HasColumnName("reason").HasMaxLength(500);
        builder.Property(n => n.Change).HasColumnName("change").HasColumnType("jsonb");
        builder.Property(n => n.Deadline).HasColumnName("deadline");
        builder.Property(n => n.OwnerAcknowledgedAt).HasColumnName("owner_acknowledged_at");
        builder.HasOne(n => n.Restaurant).WithMany().HasForeignKey(n => n.RestaurantId);
        builder.HasOne<RestaurantSubscriptionPeriod>().WithMany().HasForeignKey(n => n.PeriodId);
        builder.HasIndex(n => n.RestaurantId);
        builder
            .HasIndex(n => new
            {
                n.PeriodId,
                n.Deadline,
                n.Kind,
            })
            .IsUnique()
            .HasFilter("deadline IS NOT NULL");
    }
}

internal sealed class PlatformSubscriptionReceiptConfiguration
    : IEntityTypeConfiguration<PlatformSubscriptionReceipt>
{
    public void Configure(EntityTypeBuilder<PlatformSubscriptionReceipt> builder)
    {
        builder.ToTable("platform_subscription_receipts");
        builder.HasKey(r => new { r.PlatformUserId, r.NoticeId });
        builder.Property(r => r.NoticeId).HasColumnName("notice_id");
        builder.Property(r => r.PlatformUserId).HasColumnName("platform_user_id");
        builder
            .HasOne<SubscriptionNotice>()
            .WithMany(n => n.PlatformReceipts)
            .HasForeignKey(r => r.NoticeId);
        builder.HasOne<PlatformUser>().WithMany().HasForeignKey(r => r.PlatformUserId);
    }
}
