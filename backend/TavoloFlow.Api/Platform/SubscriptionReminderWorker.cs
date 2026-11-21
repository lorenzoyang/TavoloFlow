using TavoloFlow.Api.Push;

namespace TavoloFlow.Api.Platform;

internal sealed class SubscriptionReminderWorker(
    IServiceScopeFactory scopes,
    TimeProvider clock,
    ILogger<SubscriptionReminderWorker> logger
) : BackgroundService
{
    private static readonly TimeSpan CheckInterval = TimeSpan.FromMinutes(30);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(CheckInterval, clock);
        do
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var notices = scope.ServiceProvider.GetRequiredService<SubscriptionNotices>();
                var created = await notices.CreateRenewalNoticesAsync(stoppingToken);
                var push = scope.ServiceProvider.GetRequiredService<PlatformPushDevices>();
                await push.SendReminderAsync(created, stoppingToken);
            }
            catch (Exception error) when (!stoppingToken.IsCancellationRequested)
            {
                logger.LogWarning(
                    "Subscription reminder check failed: {Error}.",
                    error.GetType().Name
                );
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
