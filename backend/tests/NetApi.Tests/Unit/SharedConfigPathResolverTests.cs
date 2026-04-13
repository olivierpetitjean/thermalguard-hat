using AwesomeAssertions;
using NetApi.Infrastructure.Configuration;

namespace NetApi.Tests.Unit;

public class SharedConfigPathResolverTests
{
    [Fact]
    public void Resolve_ShouldReturnEnvironmentPath_WhenVariableIsSet()
    {
        const string environmentKey = "THERMALGUARD_HAT_CONFIG_PATH";
        var originalValue = Environment.GetEnvironmentVariable(environmentKey);
        var expectedPath = Path.Combine(Path.GetTempPath(), $"settings-{Guid.NewGuid():N}.json");

        try
        {
            Environment.SetEnvironmentVariable(environmentKey, expectedPath);

            var result = SharedConfigPathResolver.Resolve();

            result.Should().Be(expectedPath);
        }
        finally
        {
            Environment.SetEnvironmentVariable(environmentKey, originalValue);
        }
    }

    [Fact]
    public void Resolve_ShouldReturnNearestConfigSettingsPath_WhenFoundInParentTree()
    {
        const string environmentKey = "THERMALGUARD_HAT_CONFIG_PATH";
        var originalEnvValue = Environment.GetEnvironmentVariable(environmentKey);
        var originalCurrentDirectory = Directory.GetCurrentDirectory();
        var tempRoot = Path.Combine(Path.GetTempPath(), $"thermalguardhat-config-{Guid.NewGuid():N}");
        var nestedDirectory = Path.Combine(tempRoot, "back", "src", "NetApi");
        var configDirectory = Path.Combine(tempRoot, "config");
        var expectedPath = Path.Combine(configDirectory, "settings.json");

        try
        {
            Environment.SetEnvironmentVariable(environmentKey, null);
            Directory.CreateDirectory(nestedDirectory);
            Directory.CreateDirectory(configDirectory);
            File.WriteAllText(expectedPath, "{}");
            Directory.SetCurrentDirectory(nestedDirectory);

            var result = SharedConfigPathResolver.Resolve();

            result.Should().Be(expectedPath);
        }
        finally
        {
            Directory.SetCurrentDirectory(originalCurrentDirectory);
            Environment.SetEnvironmentVariable(environmentKey, originalEnvValue);

            if (Directory.Exists(tempRoot))
            {
                Directory.Delete(tempRoot, recursive: true);
            }
        }
    }
}
