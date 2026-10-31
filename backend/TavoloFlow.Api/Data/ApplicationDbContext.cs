using Microsoft.EntityFrameworkCore;
using TavoloFlow.Api.Entities;

namespace TavoloFlow.Api.Data;

public sealed class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : DbContext(options)
{
    public DbSet<PlatformUser> PlatformUsers => Set<PlatformUser>();
    public DbSet<Restaurant> Restaurants => Set<Restaurant>();
    public DbSet<RestaurantSubscriptionPeriod> RestaurantSubscriptionPeriods => Set<RestaurantSubscriptionPeriod>();
    public DbSet<RestaurantUser> RestaurantUsers => Set<RestaurantUser>();
    public DbSet<RestaurantTable> RestaurantTables => Set<RestaurantTable>();
    public DbSet<MenuCategory> MenuCategories => Set<MenuCategory>();
    public DbSet<MenuItem> MenuItems => Set<MenuItem>();
    public DbSet<MenuItemImage> MenuItemImages => Set<MenuItemImage>();
    public DbSet<DiningSession> DiningSessions => Set<DiningSession>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<PickupHour> PickupHours => Set<PickupHour>();
    public DbSet<PickupCounter> PickupCounters => Set<PickupCounter>();
    public DbSet<PickupRequest> PickupRequests => Set<PickupRequest>();
    public DbSet<PickupRequestItem> PickupRequestItems => Set<PickupRequestItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ApplicationDbContext).Assembly);
    }
}
