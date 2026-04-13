using AwesomeAssertions;
using NetApi.Workers;

namespace NetApi.Tests.Unit;

public class SystemMetricsWorkerTests
{
    [Fact]
    public void ResolveDriveRoot_ShouldUseDatabaseFileLocation_WhenConnectionStringHasAbsolutePath()
    {
        var databasePath = Path.Combine(Path.GetTempPath(), "thermalguardhat-tests", "metrics.db");
        var expectedRoot = Path.GetPathRoot(databasePath);

        var result = SystemMetricsWorker.ResolveDriveRoot($"Data Source={databasePath}", AppContext.BaseDirectory);

        result.Should().Be(expectedRoot);
    }

    [Fact]
    public void ResolveDriveRoot_ShouldResolveRelativeDatabasePathFromCurrentDirectory()
    {
        var originalCurrentDirectory = Directory.GetCurrentDirectory();
        var workingDirectory = Path.Combine(Path.GetTempPath(), $"thermalguardhat-cwd-{Guid.NewGuid():N}");
        Directory.CreateDirectory(workingDirectory);

        try
        {
            Directory.SetCurrentDirectory(workingDirectory);
            var expectedRoot = Path.GetPathRoot(Path.Combine(workingDirectory, "data", "thermalguard.db"));

            var result = SystemMetricsWorker.ResolveDriveRoot("Data Source=data/thermalguard.db", AppContext.BaseDirectory);

            result.Should().Be(expectedRoot);
        }
        finally
        {
            Directory.SetCurrentDirectory(originalCurrentDirectory);
            Directory.Delete(workingDirectory, recursive: true);
        }
    }

    [Fact]
    public void ResolveDriveRoot_ShouldFallbackToBaseDirectory_WhenUsingInMemoryDatabase()
    {
        var fallbackPath = AppContext.BaseDirectory;
        var expectedRoot = Path.GetPathRoot(Path.GetFullPath(fallbackPath));

        var result = SystemMetricsWorker.ResolveDriveRoot("Data Source=:memory:", fallbackPath);

        result.Should().Be(expectedRoot);
    }
}
