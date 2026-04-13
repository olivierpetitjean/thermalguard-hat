using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using NetApi.Domain;

namespace NetApi.Infrastructure.Persistence;

public class AppDbContext : DbContext
{
    protected readonly IConfiguration Configuration;

    public AppDbContext(IConfiguration configuration)
    {
        Configuration = configuration;
    }

    public static void EnsureSupplementalSchema(SqliteConnection connection)
    {
        connection.Open();

        using (var command = connection.CreateCommand())
        {
            command.CommandText = @"
                    CREATE VIEW IF NOT EXISTS DayValueReferenceView AS
                    SELECT
                        Name,
                        Ts,
                        Agregate / Divider as Avg,
                        Min,
                        Max
                    FROM DayValueReference
                    GROUP BY Ts, Name";
            command.ExecuteNonQuery();
        }

        using (var command = connection.CreateCommand())
        {
            command.CommandText = @"
                    CREATE VIEW IF NOT EXISTS HourValueReferenceView AS
                    SELECT
                        Name,
                        Ts,
                        Agregate / Divider as Avg,
                        Min,
                        Max
                    FROM HourValueReference
                    GROUP BY Ts, Name";
            command.ExecuteNonQuery();
        }

        using (var command = connection.CreateCommand())
        {
            command.CommandText = @"
                    CREATE VIEW IF NOT EXISTS PeriodValueReferenceView AS
                    SELECT
                        Name,
                        Ts,
                        Agregate / Divider as Avg,
                        Min,
                        Max
                    FROM PeriodValueReference
                    GROUP BY Ts, Name";
            command.ExecuteNonQuery();
        }

        connection.Close();
    }

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
    {
        optionsBuilder.UseSqlite(Configuration.GetConnectionString("WebApiDatabase"));
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        base.ConfigureConventions(configurationBuilder);
        configurationBuilder.DefaultTypeMapping<HistoryRaw>();
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>().ToTable("Users");

        modelBuilder.Entity<GlobalSettings>()
            .ToTable("GlobalSettings")
            .HasData(new GlobalSettings
            {
                Id = Guid.NewGuid(),
                LastUpdated = DateTime.Now,
                Auto = true,
                LinkedMode = true,
                Fan1Pwr = 15,
                Fan2Pwr = 15,
                Beep = true,
                SmtpEnable = false
            });

        var conditions = modelBuilder.Entity<Condition>();
        conditions.Property(e => e.MinTemp1).HasColumnType("NUMERIC(10,5)");
        conditions.Property(e => e.MinTemp2).HasColumnType("NUMERIC(10,5)");
        conditions.Property(e => e.MinTemp1).IsRequired();
        conditions.Property(e => e.MinTemp2).IsRequired();
        conditions.ToTable("Conditions");
        conditions.HasData(
            new Condition { Id = Guid.NewGuid(), MinTemp1 = 25, MinTemp2 = 25, Value1 = 15, Value2 = 15 },
            new Condition { Id = Guid.NewGuid(), MinTemp1 = 27, MinTemp2 = 27, Value1 = 20, Value2 = 20 },
            new Condition { Id = Guid.NewGuid(), MinTemp1 = 29, MinTemp2 = 29, Value1 = 25, Value2 = 25 },
            new Condition { Id = Guid.NewGuid(), MinTemp1 = 31, MinTemp2 = 31, Value1 = 35, Value2 = 35 },
            new Condition { Id = Guid.NewGuid(), MinTemp1 = 33, MinTemp2 = 33, Value1 = 45, Value2 = 45 },
            new Condition { Id = Guid.NewGuid(), MinTemp1 = 35, MinTemp2 = 35, Value1 = 55, Value2 = 55 },
            new Condition { Id = Guid.NewGuid(), MinTemp1 = 37, MinTemp2 = 37, Value1 = 65, Value2 = 65 },
            new Condition { Id = Guid.NewGuid(), MinTemp1 = 39, MinTemp2 = 39, Value1 = 75, Value2 = 75 },
            new Condition { Id = Guid.NewGuid(), MinTemp1 = 41, MinTemp2 = 41, Value1 = 85, Value2 = 85 },
            new Condition { Id = Guid.NewGuid(), MinTemp1 = 43, MinTemp2 = 43, Value1 = 92, Value2 = 92 },
            new Condition { Id = Guid.NewGuid(), MinTemp1 = 45, MinTemp2 = 45, Value1 = 100, Value2 = 100 }
        );

        var maxReferences = modelBuilder.Entity<MaxReferences>();
        maxReferences.Property(e => e.Value1).HasColumnType("NUMERIC(10,5)");
        maxReferences.Property(e => e.Value2).HasColumnType("NUMERIC(10,5)");
        maxReferences.ToTable("MaxReferences").HasData(new MaxReferences
        {
            Id = Guid.NewGuid(),
            Date = DateTime.Now,
            Value1 = 2080,
            Value2 = 2080
        });

        var rawHistory = modelBuilder.Entity<HistoryRaw>();
        rawHistory.HasIndex(e => e.Ts)
            .HasDatabaseName("HistoryRaw_IDX_Ts")
            .HasFilter("[Ts] IS NOT NULL");
        rawHistory.HasIndex(e => new { e.Ts, e.Name })
            .HasDatabaseName("HistoryRaw_IDX_Ts_Name")
            .HasFilter("[Ts] IS NOT NULL");
        rawHistory.Property(e => e.Value).HasColumnType("NUMERIC(10,5)");
        rawHistory.ToTable("HistoryRaw");

        var periodValueReference = modelBuilder.Entity<PeriodValueReference>();
        periodValueReference.Property(e => e.Min).HasColumnType("NUMERIC(10,5)");
        periodValueReference.Property(e => e.Max).HasColumnType("NUMERIC(10,5)");
        periodValueReference.Property(e => e.Agregate).HasColumnType("NUMERIC(10,5)");
        periodValueReference.Property(e => e.Divider).HasColumnType("INTEGER");
        periodValueReference.HasIndex(e => new { e.Ts, e.Name })
            .HasDatabaseName("PeriodValueReference_IDX_Ts_Name");
        periodValueReference.ToTable("PeriodValueReference");

        var hourValueReference = modelBuilder.Entity<HourValueReference>();
        hourValueReference.Property(e => e.Min).HasColumnType("NUMERIC(10,5)");
        hourValueReference.Property(e => e.Max).HasColumnType("NUMERIC(10,5)");
        hourValueReference.Property(e => e.Agregate).HasColumnType("NUMERIC(10,5)");
        hourValueReference.Property(e => e.Divider).HasColumnType("INTEGER");
        hourValueReference.HasIndex(e => new { e.Ts, e.Name })
            .HasDatabaseName("HourValueReference_IDX_Ts_Name");
        hourValueReference.ToTable("HourValueReference");

        var dayValueReference = modelBuilder.Entity<DayValueReference>();
        dayValueReference.Property(e => e.Min).HasColumnType("NUMERIC(10,5)");
        dayValueReference.Property(e => e.Max).HasColumnType("NUMERIC(10,5)");
        dayValueReference.Property(e => e.Agregate).HasColumnType("NUMERIC(10,5)");
        dayValueReference.Property(e => e.Divider).HasColumnType("INTEGER");
        dayValueReference.HasIndex(e => new { e.Ts, e.Name })
            .HasDatabaseName("DayValueReference_IDX_Ts_Name");
        dayValueReference.ToTable("DayValueReference");

        modelBuilder.Entity<DayValueReferenceView>(entity =>
        {
            entity.ToView("DayValueReferenceView");
            entity.HasNoKey();
        });

        modelBuilder.Entity<HourValueReferenceView>(entity =>
        {
            entity.ToView("HourValueReferenceView");
            entity.HasNoKey();
        });

        modelBuilder.Entity<PeriodValueReferenceView>(entity =>
        {
            entity.ToView("PeriodValueReferenceView");
            entity.HasNoKey();
        });

        var systemMetricSamples = modelBuilder.Entity<SystemMetricSample>();
        systemMetricSamples.Property(e => e.CpuUsage).HasColumnType("NUMERIC(10,5)");
        systemMetricSamples.Property(e => e.MemoryUsage).HasColumnType("NUMERIC(10,5)");
        systemMetricSamples.Property(e => e.DiskUsage).HasColumnType("NUMERIC(10,5)");
        systemMetricSamples.HasIndex(e => e.Ts)
            .HasDatabaseName("SystemMetricSamples_IDX_Ts");
        systemMetricSamples.ToTable("SystemMetricSamples");
    }

    public DbSet<User> Users { get; set; }
    public DbSet<GlobalSettings> GlobalSettings { get; set; }
    public DbSet<Condition> Conditions { get; set; }
    public DbSet<MaxReferences> MaxReferences { get; set; }
    public DbSet<HistoryRaw> HistoryRaw { get; set; }
    public DbSet<DayValueReference> DayValueReference { get; set; }
    public DbSet<HourValueReference> HourValueReference { get; set; }
    public DbSet<PeriodValueReference> PeriodValueReference { get; set; }
    public DbSet<DayValueReferenceView> DayValueReferenceView { get; set; }
    public DbSet<HourValueReferenceView> HourValueReferenceView { get; set; }
    public DbSet<PeriodValueReferenceView> PeriodValueReferenceView { get; set; }
    public DbSet<SystemMetricSample> SystemMetricSamples { get; set; }
}
