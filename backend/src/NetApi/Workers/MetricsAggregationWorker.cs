using NetApi.Infrastructure.Persistence;

namespace NetApi.Workers
{
    public class MetricsAggregationWorker(IServiceScopeFactory scopeFactory) : BackgroundService
    {
        private readonly IServiceScopeFactory scopeFactory = scopeFactory;

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            await DoWork(stoppingToken);
        }

        private async Task DoWork(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await using var scope = scopeFactory.CreateAsyncScope();
                    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                    var now = DateTime.Now.AddMinutes(-1);
                    var minute = now.Minute;
                    var roundedMinute = minute - (minute % 5);
                    var current5MinPeriodStart = ((DateTimeOffset)new DateTime(now.Year, now.Month, now.Day, now.Hour, roundedMinute, 0)).ToUnixTimeSeconds();
                    var currentHourStart = ((DateTimeOffset)new DateTime(now.Year, now.Month, now.Day, now.Hour, 0, 0)).ToUnixTimeSeconds();
                    var currentDayStart = ((DateTimeOffset)new DateTime(now.Year, now.Month, now.Day)).ToUnixTimeSeconds();

                    var currentMinute = new DateTime(now.Year, now.Month, now.Day, now.Hour, now.Minute, 0).ToUniversalTime();
                    var startTime = currentMinute;
                    var endTime = currentMinute.AddMinutes(1);

                    long startUnixTimestamp = ((DateTimeOffset)startTime).ToUnixTimeSeconds();
                    long endUnixTimestamp = ((DateTimeOffset)endTime).ToUnixTimeSeconds();

                    var rawValueGroups = db.HistoryRaw
                        .Where(hr => hr.Ts >= startUnixTimestamp && hr.Ts <= endUnixTimestamp)
                        .GroupBy(hr => hr.Name)
                        .ToList();

                    Console.WriteLine($"Fin rawHistrory from {startUnixTimestamp} to {endUnixTimestamp}");

                    foreach (var rawValue in rawValueGroups)
                    {
                        var min = rawValue.Min(hr => hr.Value);
                        var max = rawValue.Max(hr => hr.Value);
                        var avg = rawValue.Average(hr => hr.Value);

                        var dayValue = db.DayValueReference.FirstOrDefault(r => r.Ts == currentDayStart && r.Name == rawValue.Key);
                        if (dayValue == null)
                        {
                            db.DayValueReference.Add(new()
                            {
                                Id = Guid.NewGuid(),
                                Ts = currentDayStart,
                                Name = rawValue.Key,
                                Agregate = avg,
                                Divider = 1,
                                Min = min,
                                Max = max
                            });
                        }
                        else
                        {
                            dayValue.Divider++;
                            dayValue.Agregate += avg;

                            if (min < dayValue.Min)
                                dayValue.Min = min;

                            if (max > dayValue.Max)
                                dayValue.Max = max;
                        }

                        var hourValue = db.HourValueReference.FirstOrDefault(r => r.Ts == currentHourStart && r.Name == rawValue.Key);
                        if (hourValue == null)
                        {
                            db.HourValueReference.Add(new()
                            {
                                Id = Guid.NewGuid(),
                                Ts = currentHourStart,
                                Name = rawValue.Key,
                                Agregate = avg,
                                Divider = 1,
                                Min = min,
                                Max = max
                            });
                        }
                        else
                        {
                            hourValue.Divider++;
                            hourValue.Agregate += avg;

                            if (min < hourValue.Min)
                                hourValue.Min = min;

                            if (max > hourValue.Max)
                                hourValue.Max = max;
                        }

                        var periodValue = db.PeriodValueReference.FirstOrDefault(r => r.Ts == current5MinPeriodStart && r.Name == rawValue.Key);
                        if (periodValue == null)
                        {
                            db.PeriodValueReference.Add(new()
                            {
                                Id = Guid.NewGuid(),
                                Ts = current5MinPeriodStart,
                                Name = rawValue.Key,
                                Agregate = avg,
                                Divider = 1,
                                Min = min,
                                Max = max
                            });
                        }
                        else
                        {
                            periodValue.Divider++;
                            periodValue.Agregate += avg;

                            if (min < periodValue.Min)
                                periodValue.Min = min;

                            if (max > periodValue.Max)
                                periodValue.Max = max;
                        }

                        await db.SaveChangesAsync(stoppingToken);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine(ex);
                }

                await Task.Delay(TimeSpan.FromSeconds(60), stoppingToken);
            }
        }
    }
}
