using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class RestaurantTableConfiguration : IEntityTypeConfiguration<RestaurantTable>
{
    public void Configure(EntityTypeBuilder<RestaurantTable> builder)
    {
        builder.ToTable("restaurant_tables");

        builder.HasKey(table => table.Id);

        builder.HasAlternateKey(table => new { table.Id, table.RestaurantId }).HasName("uq_tables_id_tenant");

        builder.Property(table => table.Id).HasColumnName("id");

        builder.Property(table => table.RestaurantId).HasColumnName("restaurant_id");

        builder.Property(table => table.TableLabel).HasColumnName("table_label").HasMaxLength(50).IsRequired();

        builder.Property(table => table.QrToken).HasColumnName("qr_token").HasMaxLength(128).IsRequired();

        builder.Property(table => table.IsEnabled).HasColumnName("is_enabled").HasDefaultValue(true).ValueGeneratedNever();

        builder.Property(table => table.DeletedAt).HasColumnName("deleted_at").HasColumnType("timestamptz");

        builder.Property(table => table.CreatedAt).HasColumnName("created_at").HasColumnType("timestamptz").HasDefaultValueSql("now()");

        builder.HasIndex(table => table.QrToken).IsUnique();

        builder.HasIndex(table => table.RestaurantId);

        builder.HasIndex(table => new { table.RestaurantId, table.TableLabel }).IsUnique()
            .HasFilter("deleted_at IS NULL").HasDatabaseName("uq_tables_active_label");
            
        builder.HasOne(table => table.Restaurant).WithMany(restaurant => restaurant.Tables)
            .HasForeignKey(table => table.RestaurantId).OnDelete(DeleteBehavior.Cascade);
    }
}
