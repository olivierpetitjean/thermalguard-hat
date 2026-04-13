using AwesomeAssertions;
using Microsoft.Data.Sqlite;
using NetApi.Infrastructure.Persistence;

namespace NetApi.Tests.Unit;

public class SqliteSchemaUpgraderTests
{
    [Fact]
    public void UpgradeLegacySchema_ShouldDoNothing_WhenGlobalSettingsTableDoesNotExist()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"thermalguardhat-upgrader-{Guid.NewGuid():N}.db");
        var connectionString = $"Data Source={dbPath}";

        try
        {
            SqliteSchemaUpgrader.UpgradeLegacySchema(connectionString);

            using (var connection = new SqliteConnection(connectionString))
            {
                connection.Open();
                using var command = connection.CreateCommand();
                command.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'GlobalSettings';";

                Convert.ToInt32(command.ExecuteScalar()).Should().Be(0);
            }
        }
        finally
        {
        }
    }

    [Fact]
    public void UpgradeLegacySchema_ShouldAddLinkedModeColumn_WhenMissing()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"thermalguardhat-upgrader-{Guid.NewGuid():N}.db");
        var connectionString = $"Data Source={dbPath}";

        try
        {
            using (var connection = new SqliteConnection(connectionString))
            {
                connection.Open();
                using var command = connection.CreateCommand();
                command.CommandText = "CREATE TABLE GlobalSettings (Id TEXT PRIMARY KEY, Auto INTEGER NOT NULL);";
                command.ExecuteNonQuery();
            }

            SqliteSchemaUpgrader.UpgradeLegacySchema(connectionString);

            using (var verificationConnection = new SqliteConnection(connectionString))
            {
                verificationConnection.Open();
                using var pragma = verificationConnection.CreateCommand();
                pragma.CommandText = "PRAGMA table_info('GlobalSettings');";

                using var reader = pragma.ExecuteReader();
                var columns = new List<string>();
                while (reader.Read())
                {
                    columns.Add(reader["name"]?.ToString() ?? string.Empty);
                }

                columns.Should().Contain("LinkedMode");
            }
        }
        finally
        {
        }
    }

    [Fact]
    public void UpgradeLegacySchema_ShouldNotDuplicateLinkedModeColumn_WhenAlreadyPresent()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"thermalguardhat-upgrader-{Guid.NewGuid():N}.db");
        var connectionString = $"Data Source={dbPath}";

        try
        {
            using (var connection = new SqliteConnection(connectionString))
            {
                connection.Open();
                using var command = connection.CreateCommand();
                command.CommandText = """
                    CREATE TABLE GlobalSettings (
                        Id TEXT PRIMARY KEY,
                        Auto INTEGER NOT NULL,
                        LinkedMode INTEGER NOT NULL DEFAULT 1
                    );
                    """;
                command.ExecuteNonQuery();
            }

            SqliteSchemaUpgrader.UpgradeLegacySchema(connectionString);

            using (var verificationConnection = new SqliteConnection(connectionString))
            {
                verificationConnection.Open();
                using var pragma = verificationConnection.CreateCommand();
                pragma.CommandText = "PRAGMA table_info('GlobalSettings');";

                using var reader = pragma.ExecuteReader();
                var linkedModeColumnCount = 0;
                while (reader.Read())
                {
                    if (string.Equals(reader["name"]?.ToString(), "LinkedMode", StringComparison.OrdinalIgnoreCase))
                    {
                        linkedModeColumnCount++;
                    }
                }

                linkedModeColumnCount.Should().Be(1);
            }
        }
        finally
        {
        }
    }
}
