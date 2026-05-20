using Microsoft.Data.Sqlite;

namespace NetApi.Infrastructure.Persistence;

public static class SqliteSchemaUpgrader
{
    public static void UpgradeLegacySchema(string connectionString)
    {
        using var connection = new SqliteConnection(connectionString);
        connection.Open();

        if (!TableExists(connection, "GlobalSettings"))
        {
            return;
        }

        EnsureColumn(
            connection,
            tableName: "GlobalSettings",
            columnName: "LinkedMode",
            alterStatement: "ALTER TABLE GlobalSettings ADD COLUMN LinkedMode INTEGER NOT NULL DEFAULT 1;"
        );

        var controlModeAdded = EnsureColumn(
            connection,
            tableName: "GlobalSettings",
            columnName: "ControlMode",
            alterStatement: "ALTER TABLE GlobalSettings ADD COLUMN ControlMode TEXT NOT NULL DEFAULT 'linked_fans';"
        );

        EnsureColumn(
            connection,
            tableName: "GlobalSettings",
            columnName: "LinkedSensor",
            alterStatement: "ALTER TABLE GlobalSettings ADD COLUMN LinkedSensor TEXT NOT NULL DEFAULT 'sensor1';"
        );

        EnsureColumn(
            connection,
            tableName: "GlobalSettings",
            columnName: "DifferentialMode",
            alterStatement: "ALTER TABLE GlobalSettings ADD COLUMN DifferentialMode TEXT NOT NULL DEFAULT 'sensor1_minus_sensor2';"
        );

        EnsureColumn(
            connection,
            tableName: "GlobalSettings",
            columnName: "DisableFanAlerts",
            alterStatement: "ALTER TABLE GlobalSettings ADD COLUMN DisableFanAlerts INTEGER NOT NULL DEFAULT 0;"
        );

        if (controlModeAdded)
        {
            using var command = connection.CreateCommand();
            command.CommandText = """
                UPDATE GlobalSettings
                SET ControlMode = CASE
                    WHEN IFNULL(LinkedMode, 1) = 1 THEN 'linked_fans'
                    ELSE 'independent'
                END;
                """;
            command.ExecuteNonQuery();
        }
    }

    private static bool EnsureColumn(SqliteConnection connection, string tableName, string columnName, string alterStatement)
    {
        if (ColumnExists(connection, tableName, columnName))
        {
            return false;
        }

        Console.WriteLine($"Applying schema upgrade: {tableName}.{columnName}");
        using var command = connection.CreateCommand();
        command.CommandText = alterStatement;
        command.ExecuteNonQuery();
        return true;
    }

    private static bool TableExists(SqliteConnection connection, string tableName)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = $tableName LIMIT 1;";
        command.Parameters.AddWithValue("$tableName", tableName);

        return command.ExecuteScalar() is not null;
    }

    private static bool ColumnExists(SqliteConnection connection, string tableName, string columnName)
    {
        using var command = connection.CreateCommand();
        command.CommandText = $"PRAGMA table_info('{tableName}');";

        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            if (string.Equals(reader["name"]?.ToString(), columnName, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }
}
