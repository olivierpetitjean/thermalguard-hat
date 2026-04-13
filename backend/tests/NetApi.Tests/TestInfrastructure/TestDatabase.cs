using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;
using NetApi.Infrastructure.Persistence;

namespace NetApi.Tests.TestInfrastructure;

public sealed class TestDatabase : IDisposable
{
    public TestDatabase()
    {
        DbPath = Path.Combine(Path.GetTempPath(), $"thermalguardhat-tests-{Guid.NewGuid():N}.db");
        ConnectionString = $"Data Source={DbPath}";

        Configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:WebApiDatabase"] = ConnectionString
            })
            .Build();

        using var db = CreateContext();
        db.Database.EnsureDeleted();
        db.Database.EnsureCreated();
        using var connection = new SqliteConnection(ConnectionString);
        AppDbContext.EnsureSupplementalSchema(connection);
        SqliteSchemaUpgrader.UpgradeLegacySchema(ConnectionString);
    }

    public string DbPath { get; }

    public string ConnectionString { get; }

    public IConfiguration Configuration { get; }

    public AppDbContext CreateContext()
    {
        return new AppDbContext(Configuration);
    }

    public void Seed(Action<AppDbContext> seed)
    {
        using var db = CreateContext();
        seed(db);
        db.SaveChanges();
    }

    public void Dispose()
    {
        try
        {
            if (File.Exists(DbPath))
            {
                File.Delete(DbPath);
            }
        }
        catch
        {
            // Ignore temp file cleanup issues on Windows file locking edge cases.
        }
    }
}
