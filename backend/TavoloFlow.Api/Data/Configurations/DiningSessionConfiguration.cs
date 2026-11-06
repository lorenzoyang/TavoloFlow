using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class DiningSessionConfiguration : IEntityTypeConfiguration<DiningSession>
{
    public void Configure(EntityTypeBuilder<DiningSession> builder)
    {
        builder.ToTable(
            "dining_sessions",
            table =>
            {
                table.HasCheckConstraint("ck_session_status", "status IN ('ACTIVE', 'CLOSED')");
                table.HasCheckConstraint("ck_session_bill_version", "bill_version > 0");
                table.HasCheckConstraint(
                    "ck_session_active_table",
                    "status <> 'ACTIVE' OR table_id IS NOT NULL"
                );
                table.HasCheckConstraint(
                    "ck_session_close_reason",
                    "close_reason IS NULL OR close_reason IN ('PAID', 'VOIDED', 'EMPTY')"
                );

                table.HasCheckConstraint(
                    "ck_session_lifecycle",
                    "(status = 'ACTIVE' AND closed_at IS NULL AND close_reason IS NULL AND closed_total_cents IS NULL AND join_code_ciphertext IS NOT NULL) OR "
                        + "(status = 'CLOSED' AND closed_at IS NOT NULL AND close_reason IS NOT NULL AND closed_total_cents IS NOT NULL AND join_code_ciphertext IS NULL)"
                );

                table.HasCheckConstraint(
                    "ck_session_closed_total",
                    "closed_total_cents IS NULL OR closed_total_cents >= 0"
                );
                table.HasCheckConstraint(
                    "ck_session_close_time",
                    "closed_at IS NULL OR closed_at >= opened_at"
                );
            }
        );

        builder.HasKey(session => session.Id);

        builder
            .HasAlternateKey(session => new { session.Id, session.RestaurantId })
            .HasName("uq_sessions_id_tenant");

        builder.Property(session => session.Id).HasColumnName("id");

        builder.Property(session => session.RestaurantId).HasColumnName("restaurant_id");

        builder.Property(session => session.TableId).HasColumnName("table_id");

        builder
            .Property(session => session.Status)
            .HasColumnName("status")
            .HasMaxLength(10)
            .HasConversion<UppercaseEnumConverter<DiningSessionStatus>>()
            .HasDefaultValue(DiningSessionStatus.Active)
            .ValueGeneratedNever();

        builder
            .Property(session => session.JoinCodeCiphertext)
            .HasColumnName("join_code_ciphertext")
            .HasColumnType("text");

        builder
            .Property(session => session.BillVersion)
            .HasColumnName("bill_version")
            .HasDefaultValue(1)
            .ValueGeneratedNever();

        builder
            .Property(session => session.TableLabelSnapshot)
            .HasColumnName("table_label_snapshot")
            .HasMaxLength(50)
            .IsRequired();

        builder
            .Property(session => session.OpenedAt)
            .HasColumnName("opened_at")
            .HasColumnType("timestamptz")
            .HasDefaultValueSql("now()");

        builder
            .Property(session => session.ClosedAt)
            .HasColumnName("closed_at")
            .HasColumnType("timestamptz");

        builder
            .Property(session => session.CloseReason)
            .HasColumnName("close_reason")
            .HasMaxLength(10)
            .HasConversion<UppercaseEnumConverter<SessionCloseReason>>();

        builder.Property(session => session.ClosedTotalCents).HasColumnName("closed_total_cents");

        builder.HasIndex(session => new { session.TableId, session.Status });

        builder
            .HasIndex(session => session.TableId)
            .IsUnique()
            .HasFilter("status = 'ACTIVE'")
            .HasDatabaseName("uq_active_session_per_table");

        builder
            .HasOne(session => session.Restaurant)
            .WithMany(restaurant => restaurant.DiningSessions)
            .HasForeignKey(session => session.RestaurantId)
            .OnDelete(DeleteBehavior.Cascade);

        builder
            .HasOne(session => session.Table)
            .WithMany(table => table.DiningSessions)
            .HasForeignKey(session => new { session.TableId, session.RestaurantId })
            .HasPrincipalKey(table => new { table.Id, table.RestaurantId })
            .OnDelete(DeleteBehavior.ClientNoAction);
    }
}
