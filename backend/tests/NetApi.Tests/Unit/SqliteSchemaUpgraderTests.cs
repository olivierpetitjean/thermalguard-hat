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
    public void UpgradeLegacySchema_ShouldAddControlColumns_WhenMissing()
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
                columns.Should().Contain("ControlMode");
                columns.Should().Contain("LinkedSensor");
                columns.Should().Contain("DifferentialMode");
                columns.Should().Contain("DisableFanAlerts");
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
                        LinkedMode INTEGER NOT NULL DEFAULT 1,
                        ControlMode TEXT NOT NULL DEFAULT 'linked_fans',
                        LinkedSensor TEXT NOT NULL DEFAULT 'sensor1',
                        DifferentialMode TEXT NOT NULL DEFAULT 'sensor1_minus_sensor2',
                        DisableFanAlerts INTEGER NOT NULL DEFAULT 0
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
                var controlModeColumnCount = 0;
                var disableFanAlertsColumnCount = 0;
                while (reader.Read())
                {
                    var columnName = reader["name"]?.ToString();
                    if (string.Equals(columnName, "LinkedMode", StringComparison.OrdinalIgnoreCase))
                    {
                        linkedModeColumnCount++;
                    }
                    if (string.Equals(columnName, "ControlMode", StringComparison.OrdinalIgnoreCase))
                    {
                        controlModeColumnCount++;
                    }
                    if (string.Equals(columnName, "DisableFanAlerts", StringComparison.OrdinalIgnoreCase))
                    {
                        disableFanAlertsColumnCount++;
                    }
                }

                linkedModeColumnCount.Should().Be(1);
                controlModeColumnCount.Should().Be(1);
                disableFanAlertsColumnCount.Should().Be(1);
            }
        }
        finally
        {
        }
    }

    [Fact]
    public void UpgradeLegacySchema_ShouldMapLegacyLinkedModeToControlMode()
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

                    INSERT INTO GlobalSettings (Id, Auto, LinkedMode) VALUES ('a', 1, 1);
                    INSERT INTO GlobalSettings (Id, Auto, LinkedMode) VALUES ('b', 1, 0);
                    """;
                command.ExecuteNonQuery();
            }

            SqliteSchemaUpgrader.UpgradeLegacySchema(connectionString);

            using var verificationConnection = new SqliteConnection(connectionString);
            verificationConnection.Open();
            using var verificationCommand = verificationConnection.CreateCommand();
            verificationCommand.CommandText = "SELECT Id, ControlMode FROM GlobalSettings ORDER BY Id;";

            using var reader = verificationCommand.ExecuteReader();
            var values = new List<(string Id, string ControlMode)>();
            while (reader.Read())
            {
                values.Add((reader["Id"]?.ToString() ?? string.Empty, reader["ControlMode"]?.ToString() ?? string.Empty));
            }

            values.Should().ContainInOrder(
                ("a", "linked_fans"),
                ("b", "independent"));
        }
        finally
        {
        }
    }
}
