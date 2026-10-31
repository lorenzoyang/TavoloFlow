using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class PickupRequestConfiguration : IEntityTypeConfiguration<PickupRequest>
{
    public void Configure(EntityTypeBuilder<PickupRequest> builder)
    {
        builder.ToTable("pickup_requests", table =>
        {
            table.HasCheckConstraint("ck_pickup_request_name", "customer_name ~ '[^[:space:]]'");
            table.HasCheckConstraint("ck_pickup_request_phone", "customer_phone ~ '^\\+?[0-9]{6,15}$'");
            table.HasCheckConstraint("ck_pickup_request_number", "pickup_number > 0");
            table.HasCheckConstraint("ck_pickup_request_amount", "total_amount_cents > 0");
            table.HasCheckConstraint("ck_pickup_request_language", "default_language_snapshot IN ('zh', 'it', 'en')");
            table.HasCheckConstraint("ck_pickup_request_expiry", "expires_at > submitted_at");
            table.HasCheckConstraint("ck_pickup_request_acceptance",
                "(accepted_at IS NULL AND estimated_ready_at IS NULL AND session_id IS NULL) OR " +
                "(accepted_at IS NOT NULL AND estimated_ready_at > accepted_at AND session_id IS NOT NULL)");
            table.HasCheckConstraint("ck_pickup_request_one_decision", "accepted_at IS NULL OR rejected_at IS NULL");
            table.HasCheckConstraint("ck_pickup_request_reject_reason",
                "reject_reason IS NULL OR (rejected_at IS NOT NULL AND reject_reason IN ('SOLD_OUT', 'BUSY', 'CLOSING'))");
            // A decision is only possible while the request waits.
            table.HasCheckConstraint("ck_pickup_request_decision_time",
                "(accepted_at IS NULL OR (accepted_at >= submitted_at AND accepted_at < expires_at)) AND " +
                "(rejected_at IS NULL OR (rejected_at >= submitted_at AND rejected_at < expires_at))");
        });

        builder.HasKey(request => request.Id);
        builder.HasAlternateKey(request => new { request.Id, request.RestaurantId }).HasName("uq_pickup_requests_id_tenant");

        builder.Property(request => request.Id).HasColumnName("id");
        builder.Property(request => request.RestaurantId).HasColumnName("restaurant_id");
        builder.Property(request => request.ClientRequestId).HasColumnName("client_request_id");
        builder.Property(request => request.StatusToken).HasColumnName("status_token").HasMaxLength(64).IsRequired();
        builder.Property(request => request.BusinessDate).HasColumnName("business_date");
        builder.Property(request => request.PickupNumber).HasColumnName("pickup_number");
        builder.Property(request => request.CustomerName).HasColumnName("customer_name").HasMaxLength(20).IsRequired();
        builder.Property(request => request.CustomerPhone).HasColumnName("customer_phone").HasMaxLength(16).IsRequired();
        builder.Property(request => request.TotalAmountCents).HasColumnName("total_amount_cents");
        builder.Property(request => request.DefaultLanguageSnapshot).HasColumnName("default_language_snapshot").HasMaxLength(2).IsRequired();
        builder.Property(request => request.SubmittedAt).HasColumnName("submitted_at").HasColumnType("timestamptz");
        builder.Property(request => request.ExpiresAt).HasColumnName("expires_at").HasColumnType("timestamptz");
        builder.Property(request => request.AcceptedAt).HasColumnName("accepted_at").HasColumnType("timestamptz");
        builder.Property(request => request.EstimatedReadyAt).HasColumnName("estimated_ready_at").HasColumnType("timestamptz");
        builder.Property(request => request.SessionId).HasColumnName("session_id");
        builder.Property(request => request.RejectedAt).HasColumnName("rejected_at").HasColumnType("timestamptz");
        builder.Property(request => request.RejectReason).HasColumnName("reject_reason").HasMaxLength(10)
            .HasConversion<UppercaseEnumConverter<PickupRejectReason>>();

        builder.HasIndex(request => new { request.RestaurantId, request.ClientRequestId }).IsUnique()
            .HasDatabaseName("uq_pickup_request_per_client");
        builder.HasIndex(request => request.StatusToken).IsUnique().HasDatabaseName("uq_pickup_request_token");
        builder.HasIndex(request => new { request.RestaurantId, request.BusinessDate, request.PickupNumber }).IsUnique()
            .HasDatabaseName("uq_pickup_number");
        // One request per session; also the index of the session foreign key.
        builder.HasIndex(request => new { request.SessionId, request.RestaurantId }).IsUnique()
            .HasDatabaseName("uq_pickup_request_session");
        // Pending requests are the last ten minutes of this range; today's unaccepted ones use the business date.
        builder.HasIndex(request => new { request.RestaurantId, request.ExpiresAt });
        builder.HasIndex(request => new { request.RestaurantId, request.BusinessDate });

        builder.HasOne(request => request.Restaurant).WithMany()
            .HasForeignKey(request => request.RestaurantId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(request => request.Session).WithOne(session => session.PickupRequest)
            .HasForeignKey<PickupRequest>(request => new { request.SessionId, request.RestaurantId })
            .HasPrincipalKey<DiningSession>(session => new { session.Id, session.RestaurantId }).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class PickupRequestItemConfiguration : IEntityTypeConfiguration<PickupRequestItem>
{
    public void Configure(EntityTypeBuilder<PickupRequestItem> builder)
    {
        builder.ToTable("pickup_request_items", table =>
        {
            table.HasCheckConstraint("ck_pickup_request_item_has_name", "concat(name_zh_snapshot, name_it_snapshot, name_en_snapshot) ~ '[^[:space:]]'");
            table.HasCheckConstraint("ck_pickup_request_item_unit_price", "unit_price_cents > 0");
            table.HasCheckConstraint("ck_pickup_request_item_quantity", "quantity BETWEEN 1 AND 20");
            table.HasCheckConstraint("ck_pickup_request_item_remark", "remark IS NULL OR char_length(remark) <= 200");
        });

        builder.HasKey(item => item.Id);

        builder.Property(item => item.Id).HasColumnName("id");
        builder.Property(item => item.RestaurantId).HasColumnName("restaurant_id");
        builder.Property(item => item.PickupRequestId).HasColumnName("pickup_request_id");
        builder.Property(item => item.MenuItemId).HasColumnName("menu_item_id");
        builder.Property(item => item.ItemCodeSnapshot).HasColumnName("item_code_snapshot").HasMaxLength(40);
        builder.Property(item => item.NameZhSnapshot).HasColumnName("name_zh_snapshot").HasMaxLength(150);
        builder.Property(item => item.NameItSnapshot).HasColumnName("name_it_snapshot").HasMaxLength(150);
        builder.Property(item => item.NameEnSnapshot).HasColumnName("name_en_snapshot").HasMaxLength(150);
        builder.Property(item => item.AllergenCodesSnapshot).HasColumnName("allergen_codes_snapshot").HasColumnType("text[]").IsRequired()
            .HasDefaultValueSql("'{}'::text[]").ValueGeneratedNever();
        builder.Property(item => item.UnitPriceCents).HasColumnName("unit_price_cents");
        builder.Property(item => item.Quantity).HasColumnName("quantity");
        builder.Property(item => item.Remark).HasColumnName("remark").HasColumnType("text");

        builder.HasIndex(item => item.RestaurantId);

        builder.HasOne<Restaurant>().WithMany()
            .HasForeignKey(item => item.RestaurantId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(item => item.PickupRequest).WithMany(request => request.Items)
            .HasForeignKey(item => new { item.PickupRequestId, item.RestaurantId })
            .HasPrincipalKey(request => new { request.Id, request.RestaurantId }).OnDelete(DeleteBehavior.Cascade);
        // Item deletion clears this reference first (CatalogDeletionService); the snapshot names stay.
        builder.HasOne(item => item.MenuItem).WithMany()
            .HasForeignKey(item => new { item.MenuItemId, item.RestaurantId })
            .HasPrincipalKey(menuItem => new { menuItem.Id, menuItem.RestaurantId }).OnDelete(DeleteBehavior.ClientNoAction);
    }
}

internal sealed class PickupCounterConfiguration : IEntityTypeConfiguration<PickupCounter>
{
    public void Configure(EntityTypeBuilder<PickupCounter> builder)
    {
        builder.ToTable("pickup_counters", table => table.HasCheckConstraint("ck_pickup_counter_number", "last_number > 0"));

        builder.HasKey(counter => new { counter.RestaurantId, counter.BusinessDate });

        builder.Property(counter => counter.RestaurantId).HasColumnName("restaurant_id");
        builder.Property(counter => counter.BusinessDate).HasColumnName("business_date");
        builder.Property(counter => counter.LastNumber).HasColumnName("last_number");

        builder.HasOne<Restaurant>().WithMany()
            .HasForeignKey(counter => counter.RestaurantId).OnDelete(DeleteBehavior.Cascade);
    }
}
