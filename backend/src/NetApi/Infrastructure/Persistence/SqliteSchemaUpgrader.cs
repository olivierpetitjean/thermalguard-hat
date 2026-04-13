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
    }

    private static void EnsureColumn(SqliteConnection connection, string tableName, string columnName, string alterStatement)
    {
        if (ColumnExists(connection, tableName, columnName))
        {
            return;
        }

        Console.WriteLine($"Applying schema upgrade: {tableName}.{columnName}");
        using var command = connection.CreateCommand();
        command.CommandText = alterStatement;
        command.ExecuteNonQuery();
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
