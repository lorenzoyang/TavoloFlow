using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TavoloFlow.Api.Entities;
using TavoloFlow.Api.Online;

namespace TavoloFlow.Api.Data.Configurations;

internal sealed class OnlineRequestConfiguration : IEntityTypeConfiguration<OnlineRequest>
{
    public const int MaxCustomerNameLength = 30;
    public const int MaxDeliveryAddressLength = 200;
    public const int MaxDeliveryNotesLength = 100;

    public void Configure(EntityTypeBuilder<OnlineRequest> builder)
    {
        builder.ToTable(
            "online_requests",
            table =>
            {
                table.HasCheckConstraint(
                    "ck_online_request_fulfillment",
                    "fulfillment IN ('PICKUP', 'DELIVERY')"
                );
                table.HasCheckConstraint("ck_online_request_number", "number > 0");
                table.HasCheckConstraint(
                    "ck_online_request_source",
                    "(browser_key IS NULL AND ip_key IS NULL) OR "
                        + "(browser_key IS NOT NULL AND ip_key IS NOT NULL AND "
                        + "browser_key ~ '^[0-9a-f]{64}$' AND ip_key ~ '^[0-9a-f]{64}$')"
                );
                table.HasCheckConstraint("ck_online_request_total", "items_total_cents > 0");
                table.HasCheckConstraint(
                    "ck_online_request_language",
                    "default_language_snapshot IN ('zh', 'it', 'en')"
                );
                table.HasCheckConstraint(
                    "ck_online_request_lines",
                    "jsonb_typeof(lines) = 'array'"
                );
                table.HasCheckConstraint(
                    "ck_online_request_phone",
                    "customer_phone IS NULL OR customer_phone ~ '^\\+?[0-9]{6,15}$'"
                );
                table.HasCheckConstraint(
                    "ck_online_request_pickup_address",
                    "fulfillment = 'DELIVERY' OR (delivery_address IS NULL AND delivery_notes IS NULL)"
                );
                table.HasCheckConstraint("ck_online_request_expiry", "expires_at > submitted_at");
                table.HasCheckConstraint(
                    "ck_online_request_coupon",
                    "(coupon_code IS NULL AND coupon_percent_off IS NULL) OR "
                        + "(coupon_code IS NOT NULL AND coupon_percent_off IS NOT NULL AND "
                        + $"coupon_percent_off BETWEEN {OnlineCoupons.MinPercent} AND {OnlineCoupons.MaxPercent})"
                );
                // Accepted or rejected, never both, and only while the request was still waiting.
                // Checks pass on NULL, so every comparison on a nullable column also states IS NOT NULL.
                table.HasCheckConstraint(
                    "ck_online_request_decision",
                    "(accepted_at IS NULL OR rejected_at IS NULL) AND "
                        + "(accepted_at IS NULL OR accepted_at < expires_at) AND "
                        + "(rejected_at IS NULL OR rejected_at < expires_at)"
                );
                table.HasCheckConstraint(
                    "ck_online_request_accepted",
                    "(accepted_at IS NULL AND estimated_at IS NULL AND session_id IS NULL) OR "
                        + "(accepted_at IS NOT NULL AND estimated_at IS NOT NULL AND estimated_at >= accepted_at AND session_id IS NOT NULL)"
                );
                table.HasCheckConstraint(
                    "ck_online_request_reject_reason",
                    "reject_reason IS NULL OR (rejected_at IS NOT NULL AND "
                        + "(reject_reason IN ('SOLD_OUT', 'BUSY', 'CLOSING') OR "
                        + "(reject_reason = 'OUT_OF_RANGE' AND fulfillment = 'DELIVERY')))"
                );
            }
        );

        builder.HasKey(request => request.Id);
        builder
            .HasAlternateKey(request => new { request.Id, request.RestaurantId })
            .HasName("uq_online_requests_id_tenant");

        builder.Property(request => request.Id).HasColumnName("id");
        builder.Property(request => request.RestaurantId).HasColumnName("restaurant_id");
        builder.Property(request => request.ClientRequestId).HasColumnName("client_request_id");
        builder
            .Property(request => request.BrowserKey)
            .HasColumnName("browser_key")
            .HasMaxLength(64);
        builder.Property(request => request.IpKey).HasColumnName("ip_key").HasMaxLength(64);
        builder
            .Property(request => request.StatusToken)
            .HasColumnName("status_token")
            .HasMaxLength(128)
            .IsRequired();
        builder
            .Property(request => request.BusinessDate)
            .HasColumnName("business_date")
            .HasColumnType("date");
        builder.Property(request => request.Number).HasColumnName("number");
        builder
            .Property(request => request.Fulfillment)
            .HasColumnName("fulfillment")
            .HasMaxLength(10)
            .HasConversion<UppercaseEnumConverter<OnlineFulfillment>>();
        builder
            .Property(request => request.CustomerName)
            .HasColumnName("customer_name")
            .HasMaxLength(MaxCustomerNameLength);
        builder
            .Property(request => request.CustomerPhone)
            .HasColumnName("customer_phone")
            .HasMaxLength(16);
        builder
            .Property(request => request.DeliveryAddress)
            .HasColumnName("delivery_address")
            .HasMaxLength(MaxDeliveryAddressLength);
        builder
            .Property(request => request.DeliveryNotes)
            .HasColumnName("delivery_notes")
            .HasMaxLength(MaxDeliveryNotesLength);

        // The same snapshot fields as an order item, with the options nested as in options_snapshot.
        builder.ComplexCollection(
            request => request.Lines,
            lines =>
            {
                lines.ToJson("lines");
                lines.Property(line => line.MenuItemId).HasJsonPropertyName("menuItemId");
                lines.Property(line => line.ItemCode).HasJsonPropertyName("itemCode");
                lines.Property(line => line.NameZh).HasJsonPropertyName("nameZh");
                lines.Property(line => line.NameIt).HasJsonPropertyName("nameIt");
                lines.Property(line => line.NameEn).HasJsonPropertyName("nameEn");
                lines.Property(line => line.AllergenCodes).HasJsonPropertyName("allergenCodes");
                lines.Property(line => line.UnitPriceCents).HasJsonPropertyName("unitPriceCents");
                lines.Property(line => line.Quantity).HasJsonPropertyName("quantity");
                lines.Property(line => line.Remark).HasJsonPropertyName("remark");
                lines.ComplexCollection(
                    line => line.Options,
                    options =>
                    {
                        options.HasJsonPropertyName("options");
                        options
                            .Property(option => option.GroupNameZh)
                            .HasJsonPropertyName("groupNameZh");
                        options
                            .Property(option => option.GroupNameIt)
                            .HasJsonPropertyName("groupNameIt");
                        options
                            .Property(option => option.GroupNameEn)
                            .HasJsonPropertyName("groupNameEn");
                        options.Property(option => option.NameZh).HasJsonPropertyName("nameZh");
                        options.Property(option => option.NameIt).HasJsonPropertyName("nameIt");
                        options.Property(option => option.NameEn).HasJsonPropertyName("nameEn");
                        options
                            .Property(option => option.PriceDeltaCents)
                            .HasJsonPropertyName("priceDeltaCents");
                    }
                );
            }
        );

        builder.Property(request => request.ItemsTotalCents).HasColumnName("items_total_cents");
        builder
            .Property(request => request.CouponCode)
            .HasColumnName("coupon_code")
            .HasMaxLength(OnlineCoupons.MaxCodeLength);
        builder.Property(request => request.CouponPercentOff).HasColumnName("coupon_percent_off");
        builder
            .Property(request => request.DefaultLanguageSnapshot)
            .HasColumnName("default_language_snapshot")
            .HasMaxLength(2)
            .IsRequired();
        builder
            .Property(request => request.SubmittedAt)
            .HasColumnName("submitted_at")
            .HasColumnType("timestamptz");
        builder
            .Property(request => request.ExpiresAt)
            .HasColumnName("expires_at")
            .HasColumnType("timestamptz");
        builder
            .Property(request => request.AcceptedAt)
            .HasColumnName("accepted_at")
            .HasColumnType("timestamptz");
        builder
            .Property(request => request.EstimatedAt)
            .HasColumnName("estimated_at")
            .HasColumnType("timestamptz");
        builder.Property(request => request.SessionId).HasColumnName("session_id");
        builder
            .Property(request => request.RejectedAt)
            .HasColumnName("rejected_at")
            .HasColumnType("timestamptz");
        builder
            .Property(request => request.RejectReason)
            .HasColumnName("reject_reason")
            .HasMaxLength(12)
            .HasConversion<UppercaseEnumConverter<OnlineRejectReason>>();

        builder
            .HasIndex(request => new { request.RestaurantId, request.ClientRequestId })
            .IsUnique()
            .HasDatabaseName("uq_online_request_client_request");
        builder
            .HasIndex(request => request.StatusToken)
            .IsUnique()
            .HasDatabaseName("uq_online_request_status_token");
        builder
            .HasIndex(request => new
            {
                request.RestaurantId,
                request.BusinessDate,
                request.Number,
            })
            .IsUnique()
            .HasDatabaseName("uq_online_request_number");
        // One request per session; the composite foreign key below uses this index.
        builder
            .HasIndex(request => new { request.SessionId, request.RestaurantId })
            .IsUnique()
            .HasDatabaseName("uq_online_request_session");
        // Waiting requests (the pending list, the submission cap and the services switch) read only a time
        // range of this index, so the query never grows with history.
        builder
            .HasIndex(request => new { request.RestaurantId, request.ExpiresAt })
            .HasFilter("accepted_at IS NULL AND rejected_at IS NULL")
            .HasDatabaseName("ix_online_requests_waiting");
        // Contact data still to clear after 30 days.
        builder
            .HasIndex(request => new { request.RestaurantId, request.SubmittedAt })
            .HasFilter("customer_phone IS NOT NULL")
            .HasDatabaseName("ix_online_requests_contact");

        builder
            .HasOne(request => request.Restaurant)
            .WithMany()
            .HasForeignKey(request => request.RestaurantId)
            .OnDelete(DeleteBehavior.Cascade);
        builder
            .HasOne(request => request.Session)
            .WithOne(session => session.OnlineRequest)
            .HasForeignKey<OnlineRequest>(request => new
            {
                request.SessionId,
                request.RestaurantId,
            })
            .HasPrincipalKey<DiningSession>(session => new { session.Id, session.RestaurantId })
            .OnDelete(DeleteBehavior.ClientNoAction);
    }
}
