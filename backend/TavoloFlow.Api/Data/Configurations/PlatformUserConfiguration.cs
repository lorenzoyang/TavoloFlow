using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class PlatformUserConfiguration : IEntityTypeConfiguration<PlatformUser>
{
    public void Configure(EntityTypeBuilder<PlatformUser> builder)
    {
        builder.ToTable("platform_users", table =>
            table.HasCheckConstraint("ck_platform_user_credential_version", "credential_version > 0"));

        builder.HasKey(user => user.Id);
        builder.Property(user => user.Id).HasColumnName("id");

        builder.Property(user => user.Username).HasColumnName("username").HasMaxLength(50).IsRequired();

        builder.Property(user => user.PasswordHash).HasColumnName("password_hash").HasMaxLength(255).IsRequired();

        builder.Property(user => user.IsActive).HasColumnName("is_active").HasDefaultValue(true).ValueGeneratedNever();

        builder.Property(user => user.CredentialVersion).HasColumnName("credential_version").HasDefaultValue(1).ValueGeneratedNever();

        builder.Property(user => user.CreatedAt).HasColumnName("created_at").HasColumnType("timestamptz").HasDefaultValueSql("now()");

        builder.HasIndex(user => user.Username).IsUnique();
    }
}
