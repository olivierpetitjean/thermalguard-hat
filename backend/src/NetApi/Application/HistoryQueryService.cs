using NetApi.Application.Models;
using NetApi.Infrastructure.Persistence;

namespace NetApi.Application;

public class HistoryQueryService(AppDbContext db)
{
    private readonly AppDbContext db = db;

    public List<HistoryPoint> GetGraph(string time, IEnumerable<string> sensors, long from, long to)
    {
        return time switch
        {
            "hourly" => GetHourlyValues(sensors, from, to),
            "daily" => db.DayValueReferenceView
                .Where(h => h.Ts >= from && h.Ts <= to && sensors.Contains(h.Name))
                .Select(MapHistoryPoint)
                .ToList(),
            "period" => GetPeriodValues(sensors, from, to),
            _ => []
        };
    }

    private List<HistoryPoint> GetPeriodValues(IEnumerable<string> sensors, long from, long to)
    {
        var futurePeriods = new List<HistoryPoint>();
        var now = DateTime.Now.AddMinutes(-1);
        var minute = now.Minute;
        var roundedMinute = minute - (minute % 5);
        var currentUnixTime = ((DateTimeOffset)new DateTime(now.Year, now.Month, now.Day, now.Hour, roundedMinute, 0)).ToUnixTimeSeconds();

        foreach (var sensor in sensors)
        {
            if (currentUnixTime <= to)
            {
                for (long ts = currentUnixTime; ts <= to; ts += 300)
                {
                    futurePeriods.Add(new HistoryPoint
                    {
                        Ts = ts,
                        Name = sensor,
                        MaxValue = 0,
                        MinValue = 0,
                        Value = 0
                    });
                }
            }
        }

        var historyData = db.PeriodValueReferenceView
            .Where(h => h.Ts >= from && h.Ts <= to && sensors.Contains(h.Name))
            .Select(MapHistoryPoint)
            .ToList();

        historyData.AddRange(futurePeriods);
        return historyData;
    }

    private List<HistoryPoint> GetHourlyValues(IEnumerable<string> sensors, long from, long to)
    {
        var futurePeriods = new List<HistoryPoint>();
        var now = DateTime.Now;
        var currentUnixTime = ((DateTimeOffset)new DateTime(now.Year, now.Month, now.Day, now.Hour, 0, 0)).ToUnixTimeSeconds();

        foreach (var sensor in sensors)
        {
            if (currentUnixTime <= to)
            {
                for (long ts = currentUnixTime; ts <= to; ts += 3600)
                {
                    futurePeriods.Add(new HistoryPoint
                    {
                        Ts = ts,
                        Name = sensor,
                        MaxValue = 0,
                        MinValue = 0,
                        Value = 0
                    });
                }
            }
        }

        var historyData = db.HourValueReferenceView
            .Where(h => h.Ts >= from && h.Ts <= to && sensors.Contains(h.Name))
            .Select(MapHistoryPoint)
            .ToList();

        historyData.AddRange(futurePeriods);
        return historyData;
    }

    private static HistoryPoint MapHistoryPoint(NetApi.Domain.ValueReferenceView value)
    {
        return new HistoryPoint
        {
            Ts = value.Ts,
            Name = value.Name,
            MaxValue = value.Max,
            MinValue = value.Min,
            Value = value.Avg
        };
    }
}
