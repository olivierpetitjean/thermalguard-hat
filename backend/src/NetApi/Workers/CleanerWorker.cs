using Microsoft.EntityFrameworkCore;
using NetApi.Infrastructure.Persistence;

namespace NetApi.Workers
{
    public class CleanerWorker(IServiceScopeFactory scopeFactory, IConfiguration configuration) : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
        private readonly int _retentionDays = configuration.GetValue<int>("RetentionDays", 30);

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    var cutoff = ((DateTimeOffset)DateTime.UtcNow.AddDays(-_retentionDays)).ToUnixTimeSeconds();

                    using var scope = _scopeFactory.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                    var deleted = await db.HistoryRaw
                        .Where(h => h.Ts < cutoff)
                        .ExecuteDeleteAsync(stoppingToken);

                    Console.WriteLine($"CleanerWorker: deleted {deleted} raw records older than {_retentionDays} days.");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"CleanerWorker error: {ex.Message}");
                }

                await Task.Delay(TimeSpan.FromHours(24), stoppingToken);
            }
        }
    }
}
