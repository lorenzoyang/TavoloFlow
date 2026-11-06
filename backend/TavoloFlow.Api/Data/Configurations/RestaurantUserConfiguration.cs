using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Accounts;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class RestaurantUserConfiguration : IEntityTypeConfiguration<RestaurantUser>
{
    public void Configure(EntityTypeBuilder<RestaurantUser> builder)
    {
        builder.ToTable(
            "restaurant_users",
            table =>
            {
                table.HasCheckConstraint("ck_restaurant_user_role", "role IN ('OWNER', 'STAFF')");
                table.HasCheckConstraint(
                    "ck_restaurant_user_credential_version",
                    "credential_version > 0"
                );
                table.HasCheckConstraint(
                    "ck_restaurant_user_username",
                    "username = lower(btrim(username)) AND username ~ '[^[:space:]]'"
                );
            }
        );

        builder.HasKey(user => user.Id);

        builder
            .HasAlternateKey(user => new { user.Id, user.RestaurantId })
            .HasName("uq_restaurant_users_id_tenant");

        builder.Property(user => user.Id).HasColumnName("id");

        builder.Property(user => user.RestaurantId).HasColumnName("restaurant_id");

        builder
            .Property(user => user.Username)
            .HasColumnName("username")
            .HasMaxLength(AccountInput.MaxUsernameLength)
            .IsRequired();

        builder
            .Property(user => user.PasswordHash)
            .HasColumnName("password_hash")
            .HasMaxLength(255)
            .IsRequired();

        builder
            .Property(user => user.Role)
            .HasColumnName("role")
            .HasMaxLength(10)
            .HasConversion<UppercaseEnumConverter<RestaurantUserRole>>();

        builder
            .Property(user => user.IsActive)
            .HasColumnName("is_active")
            .HasDefaultValue(true)
            .ValueGeneratedNever();

        builder
            .Property(user => user.MustChangePassword)
            .HasColumnName("must_change_password")
            .HasDefaultValue(true)
            .ValueGeneratedNever();

        builder
            .Property(user => user.CredentialVersion)
            .HasColumnName("credential_version")
            .HasDefaultValue(1)
            .ValueGeneratedNever();

        builder
            .Property(user => user.CreatedAt)
            .HasColumnName("created_at")
            .HasColumnType("timestamptz")
            .HasDefaultValueSql("now()");

        builder.HasIndex(user => user.Username).IsUnique();

        builder
            .HasIndex(user => new { user.RestaurantId, user.Role })
            .IsUnique()
            .HasDatabaseName("uq_restaurant_account_role");

        builder
            .HasOne(user => user.Restaurant)
            .WithMany(restaurant => restaurant.Users)
            .HasForeignKey(user => user.RestaurantId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
