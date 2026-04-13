using NetApi.Application.Models;
using NetApi.Infrastructure.Persistence;

namespace NetApi.Application;

public class SystemMetricsQueryService(AppDbContext db)
{
    private readonly AppDbContext db = db;

    public List<SystemMetricPoint> GetWindow(string window)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        long from = window switch
        {
            "1h" => now - 3600,
            "24h" => now - 86400,
            "7d" => now - 604800,
            _ => now - 86400
        };

        var rows = db.SystemMetricSamples
            .Where(item => item.Ts >= from && item.Ts <= now)
            .OrderBy(item => item.Ts)
            .ToList();

        if (rows.Count == 0)
        {
            return [];
        }

        const int maxPoints = 240;
        var bucketSize = rows.Count > maxPoints
            ? (int)Math.Ceiling(rows.Count / (decimal)maxPoints)
            : 1;

        return rows
            .Select((item, index) => new { item, index })
            .GroupBy(x => x.index / bucketSize)
            .Select(group => new SystemMetricPoint
            {
                Ts = (long)Math.Round(group.Average(x => x.item.Ts)),
                CpuUsage = Math.Round(group.Average(x => x.item.CpuUsage), 2),
                MemoryUsage = Math.Round(group.Average(x => x.item.MemoryUsage), 2),
                DiskUsage = Math.Round(group.Average(x => x.item.DiskUsage), 2)
            })
            .ToList();
    }
}
