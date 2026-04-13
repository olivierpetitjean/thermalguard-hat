using AwesomeAssertions;
using NetApi.Application;
using NetApi.Domain;
using NetApi.Tests.TestInfrastructure;

namespace NetApi.Tests.Unit;

public class SystemMetricsQueryServiceTests
{
    [Fact]
    public void GetWindow_ShouldReturnOrderedReducedPoints()
    {
        using var database = new TestDatabase();
        var start = DateTimeOffset.UtcNow.AddMinutes(-59).ToUnixTimeSeconds();

        database.Seed(db =>
        {
            db.SystemMetricSamples.RemoveRange(db.SystemMetricSamples);

            for (var index = 0; index < 300; index++)
            {
                db.SystemMetricSamples.Add(new SystemMetricSample
                {
                    Ts = start + index * 10,
                    CpuUsage = index,
                    MemoryUsage = index + 10,
                    DiskUsage = index + 20
                });
            }
        });

        using var db = database.CreateContext();
        var service = new SystemMetricsQueryService(db);

        var result = service.GetWindow("1h");

        result.Should().HaveCount(150);
        result.Should().BeInAscendingOrder(item => item.Ts);
        result[0].CpuUsage.Should().Be(0.5m);
        result[0].MemoryUsage.Should().Be(10.5m);
        result[0].DiskUsage.Should().Be(20.5m);
    }

    [Fact]
    public void GetWindow_ShouldReturnEmptyList_WhenNoRowsExist()
    {
        using var database = new TestDatabase();
        database.Seed(db =>
        {
            db.SystemMetricSamples.RemoveRange(db.SystemMetricSamples);
        });

        using var db = database.CreateContext();
        var service = new SystemMetricsQueryService(db);

        var result = service.GetWindow("24h");

        result.Should().BeEmpty();
    }

    [Fact]
    public void GetWindow_ShouldFallbackTo24Hours_WhenWindowIsUnknown()
    {
        using var database = new TestDatabase();
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        database.Seed(db =>
        {
            db.SystemMetricSamples.RemoveRange(db.SystemMetricSamples);
            db.SystemMetricSamples.AddRange(
                new SystemMetricSample { Ts = now - 2 * 86400, CpuUsage = 10, MemoryUsage = 20, DiskUsage = 30 },
                new SystemMetricSample { Ts = now - 3600, CpuUsage = 40, MemoryUsage = 50, DiskUsage = 60 });
        });

        using var db = database.CreateContext();
        var service = new SystemMetricsQueryService(db);

        var result = service.GetWindow("unexpected");

        result.Should().ContainSingle();
        result[0].CpuUsage.Should().Be(40);
        result[0].MemoryUsage.Should().Be(50);
        result[0].DiskUsage.Should().Be(60);
    }
}
