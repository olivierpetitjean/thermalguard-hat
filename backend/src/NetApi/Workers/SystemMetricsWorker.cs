using Microsoft.EntityFrameworkCore;
using Microsoft.Data.Sqlite;
using NetApi.Domain;
using NetApi.Infrastructure.Persistence;
using System.Globalization;

namespace NetApi.Workers
{
    public class SystemMetricsWorker(IServiceScopeFactory scopeFactory, IConfiguration configuration) : BackgroundService
    {
        private const int SampleIntervalSeconds = 60;
        private const int RetentionDays = 7;
        private CpuSnapshot? previousCpuSnapshot;

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await CaptureAsync(stoppingToken);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"SystemMetricsWorker error: {ex}");
                }

                await Task.Delay(TimeSpan.FromSeconds(SampleIntervalSeconds), stoppingToken);
            }
        }

        private async Task CaptureAsync(CancellationToken stoppingToken)
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var retentionCutoff = DateTimeOffset.UtcNow.AddDays(-RetentionDays).ToUnixTimeSeconds();
            var cpu = ReadCpuUsage();
            var memory = ReadMemoryUsage();
            var disk = ReadDiskUsage(configuration.GetConnectionString("WebApiDatabase"));

            await using var scope = scopeFactory.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            await db.SystemMetricSamples
                .Where(item => item.Ts < retentionCutoff)
                .ExecuteDeleteAsync(stoppingToken);

            db.SystemMetricSamples.Add(new SystemMetricSample
            {
                Id = Guid.NewGuid(),
                Ts = now,
                CpuUsage = cpu,
                MemoryUsage = memory,
                DiskUsage = disk
            });

            await db.SaveChangesAsync(stoppingToken);
        }

        private decimal ReadCpuUsage()
        {
            var line = File.ReadLines("/proc/stat").FirstOrDefault();
            if (string.IsNullOrWhiteSpace(line))
            {
                return 0;
            }

            var parts = line
                .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Skip(1)
                .Select(value => long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) ? parsed : 0L)
                .ToArray();

            if (parts.Length < 8)
            {
                return 0;
            }

            var idle = parts[3] + parts[4];
            var total = parts.Sum();
            var snapshot = new CpuSnapshot(total, idle);

            if (previousCpuSnapshot is null)
            {
                previousCpuSnapshot = snapshot;
                return 0;
            }

            var totalDelta = snapshot.Total - previousCpuSnapshot.Total;
            var idleDelta = snapshot.Idle - previousCpuSnapshot.Idle;
            previousCpuSnapshot = snapshot;

            if (totalDelta <= 0)
            {
                return 0;
            }

            var usage = (1m - (decimal)idleDelta / totalDelta) * 100m;
            return decimal.Round(Math.Clamp(usage, 0m, 100m), 2);
        }

        private static decimal ReadMemoryUsage()
        {
            var values = File.ReadLines("/proc/meminfo")
                .Select(line => line.Split(':', 2))
                .Where(parts => parts.Length == 2)
                .ToDictionary(
                    parts => parts[0].Trim(),
                    parts =>
                    {
                        var number = parts[1].Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "0";
                        return decimal.TryParse(number, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
                            ? parsed
                            : 0m;
                    });

            if (!values.TryGetValue("MemTotal", out var total) || total <= 0)
            {
                return 0;
            }

            values.TryGetValue("MemAvailable", out var available);
            var usedPercent = ((total - available) / total) * 100m;
            return decimal.Round(Math.Clamp(usedPercent, 0m, 100m), 2);
        }

        internal static decimal ReadDiskUsage(string? connectionString)
        {
            var currentRoot = ResolveDriveRoot(connectionString, AppContext.BaseDirectory);
            var drive = DriveInfo.GetDrives()
                .FirstOrDefault(item => item.IsReady && string.Equals(item.RootDirectory.FullName, currentRoot, StringComparison.OrdinalIgnoreCase))
                ?? DriveInfo.GetDrives().FirstOrDefault(item => item.IsReady);

            if (drive is null || drive.TotalSize <= 0)
            {
                return 0;
            }

            var used = drive.TotalSize - drive.AvailableFreeSpace;
            var usedPercent = (decimal)used / drive.TotalSize * 100m;
            return decimal.Round(Math.Clamp(usedPercent, 0m, 100m), 2);
        }

        internal static string ResolveDriveRoot(string? connectionString, string fallbackPath)
        {
            var fallbackRoot = Path.GetPathRoot(Path.GetFullPath(fallbackPath)) ?? "/";
            if (string.IsNullOrWhiteSpace(connectionString))
            {
                return fallbackRoot;
            }

            var builder = new SqliteConnectionStringBuilder(connectionString);
            var dataSource = builder.DataSource;
            if (string.IsNullOrWhiteSpace(dataSource) || string.Equals(dataSource, ":memory:", StringComparison.OrdinalIgnoreCase))
            {
                return fallbackRoot;
            }

            var fullDataSourcePath = Path.IsPathRooted(dataSource)
                ? dataSource
                : Path.GetFullPath(dataSource, Directory.GetCurrentDirectory());

            return Path.GetPathRoot(fullDataSourcePath) ?? fallbackRoot;
        }

        private sealed record CpuSnapshot(long Total, long Idle);
    }
}
