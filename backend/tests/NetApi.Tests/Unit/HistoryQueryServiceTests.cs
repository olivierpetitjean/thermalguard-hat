using AwesomeAssertions;
using NetApi.Application;
using NetApi.Domain;
using NetApi.Infrastructure.Persistence;
using NetApi.Tests.TestInfrastructure;

namespace NetApi.Tests.Unit;

public class HistoryQueryServiceTests
{
    [Fact]
    public void GetGraph_ShouldReturnDailyValuesForRequestedSensor()
    {
        using var database = new TestDatabase();
        var ts = DateTimeOffset.UtcNow.AddHours(-2).ToUnixTimeSeconds();

        database.Seed(db =>
        {
            db.DayValueReference.RemoveRange(db.DayValueReference);
            db.DayValueReference.AddRange(
                new DayValueReference { Ts = ts, Name = "sensor1", Agregate = 60, Divider = 2, Min = 20, Max = 40 },
                new DayValueReference { Ts = ts, Name = "sensor2", Agregate = 90, Divider = 3, Min = 10, Max = 50 });
        });

        using var db = database.CreateContext();
        using (var connection = new Microsoft.Data.Sqlite.SqliteConnection(database.ConnectionString))
        {
            AppDbContext.EnsureSupplementalSchema(connection);
        }

        var service = new HistoryQueryService(db);

        var result = service.GetGraph("daily", ["sensor1"], ts - 1, ts + 1);

        result.Should().ContainSingle();
        result[0].Name.Should().Be("sensor1");
        result[0].Value.Should().Be(30);
        result[0].MinValue.Should().Be(20);
        result[0].MaxValue.Should().Be(40);
    }

    [Fact]
    public void GetGraph_ShouldReturnFuturePeriodPlaceholders_WhenRangeExtendsIntoFuture()
    {
        using var database = new TestDatabase();
        using var db = database.CreateContext();
        var service = new HistoryQueryService(db);

        var now = DateTime.Now.AddMinutes(-1);
        var roundedMinute = now.Minute - (now.Minute % 5);
        var currentPeriodStart = ((DateTimeOffset)new DateTime(now.Year, now.Month, now.Day, now.Hour, roundedMinute, 0)).ToUnixTimeSeconds();
        var result = service.GetGraph("period", ["sensor1"], currentPeriodStart, currentPeriodStart + 600);

        result.Should().NotBeEmpty();
        result.Should().OnlyContain(point => point.Name == "sensor1");
        result.Should().OnlyContain(point => point.Value == 0 && point.MinValue == 0 && point.MaxValue == 0);
    }

    [Fact]
    public void GetGraph_ShouldReturnHourlyValues_ForMultipleSensors()
    {
        using var database = new TestDatabase();
        var ts = DateTimeOffset.UtcNow.AddHours(-3).ToUnixTimeSeconds();

        database.Seed(db =>
        {
            db.HourValueReference.RemoveRange(db.HourValueReference);
            db.HourValueReference.AddRange(
                new HourValueReference { Ts = ts, Name = "sensor1", Agregate = 40, Divider = 2, Min = 15, Max = 25 },
                new HourValueReference { Ts = ts, Name = "sensor2", Agregate = 90, Divider = 3, Min = 20, Max = 40 });
        });

        using var db = database.CreateContext();
        using (var connection = new Microsoft.Data.Sqlite.SqliteConnection(database.ConnectionString))
        {
            AppDbContext.EnsureSupplementalSchema(connection);
        }

        var service = new HistoryQueryService(db);

        var result = service.GetGraph("hourly", ["sensor1", "sensor2"], ts - 1, ts + 1);

        result.Should().HaveCount(2);
        result.Should().Contain(point => point.Name == "sensor1" && point.Value == 20 && point.MinValue == 15 && point.MaxValue == 25);
        result.Should().Contain(point => point.Name == "sensor2" && point.Value == 30 && point.MinValue == 20 && point.MaxValue == 40);
    }

    [Fact]
    public void GetGraph_ShouldMergeExistingPeriodValuesAndFuturePlaceholders()
    {
        using var database = new TestDatabase();
        var now = DateTime.Now.AddMinutes(-1);
        var roundedMinute = now.Minute - (now.Minute % 5);
        var currentPeriodStart = ((DateTimeOffset)new DateTime(now.Year, now.Month, now.Day, now.Hour, roundedMinute, 0)).ToUnixTimeSeconds();

        database.Seed(db =>
        {
            db.PeriodValueReference.RemoveRange(db.PeriodValueReference);
            db.PeriodValueReference.Add(new PeriodValueReference
            {
                Ts = currentPeriodStart - 300,
                Name = "sensor1",
                Agregate = 75,
                Divider = 3,
                Min = 20,
                Max = 30
            });
        });

        using var db = database.CreateContext();
        using (var connection = new Microsoft.Data.Sqlite.SqliteConnection(database.ConnectionString))
        {
            AppDbContext.EnsureSupplementalSchema(connection);
        }

        var service = new HistoryQueryService(db);
        var result = service.GetGraph("period", ["sensor1"], currentPeriodStart - 300, currentPeriodStart + 300);

        result.Should().Contain(point => point.Ts == currentPeriodStart - 300 && point.Value == 25 && point.MinValue == 20 && point.MaxValue == 30);
        result.Should().Contain(point => point.Ts == currentPeriodStart && point.Value == 0 && point.MinValue == 0 && point.MaxValue == 0);
        result.Should().Contain(point => point.Ts == currentPeriodStart + 300 && point.Value == 0 && point.MinValue == 0 && point.MaxValue == 0);
    }

    [Fact]
    public void GetGraph_ShouldReturnEmptyList_ForUnknownWindow()
    {
        using var database = new TestDatabase();
        using var db = database.CreateContext();
        var service = new HistoryQueryService(db);

        var result = service.GetGraph("unexpected", ["sensor1"], 0, 1);

        result.Should().BeEmpty();
    }
}
