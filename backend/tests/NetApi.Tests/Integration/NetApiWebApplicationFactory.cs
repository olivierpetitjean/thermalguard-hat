using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using NetApi.Tests.TestInfrastructure;

namespace NetApi.Tests.Integration;

public sealed class NetApiWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string originalCurrentDirectory;
    private readonly Dictionary<string, string?> originalEnvironmentValues = [];
    private readonly Dictionary<string, string?> configurationOverrides;

    public NetApiWebApplicationFactory(Dictionary<string, string?>? configurationOverrides = null)
    {
        originalCurrentDirectory = Directory.GetCurrentDirectory();
        Directory.SetCurrentDirectory(AppProjectPath);

        Database = new TestDatabase();
        JwtSecret = "tests-jwt-secret-value-with-sufficient-length";

        this.configurationOverrides = new Dictionary<string, string?>
        {
            ["AllowedOrigins"] = "http://localhost:4200",
            ["Auth:JwtSecret"] = JwtSecret,
            ["Auth:TokenExpiryHours"] = "12",
            ["BrokerHostSettings:Host"] = "localhost",
            ["BrokerHostSettings:Port"] = "1883",
            ["BrokerHostSettings:WsPort"] = "9001",
            ["BrokerHostSettings:UseTls"] = "false",
            ["ConnectionStrings:WebApiDatabase"] = Database.ConnectionString
        };

        if (configurationOverrides is not null)
        {
            foreach (var pair in configurationOverrides)
            {
                this.configurationOverrides[pair.Key] = pair.Value;
            }
        }

        foreach (var pair in this.configurationOverrides)
        {
            var environmentKey = pair.Key.Replace(":", "__", StringComparison.Ordinal);
            originalEnvironmentValues[environmentKey] = Environment.GetEnvironmentVariable(environmentKey);
            Environment.SetEnvironmentVariable(environmentKey, pair.Value);
        }
    }

    public TestDatabase Database { get; }

    public string JwtSecret { get; }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Production");

        builder.ConfigureAppConfiguration((_, configBuilder) =>
        {
            configBuilder.AddInMemoryCollection(configurationOverrides);
        });

        builder.ConfigureServices(services =>
        {
            var workerDescriptors = services
                .Where(descriptor =>
                    descriptor.ServiceType == typeof(IHostedService) &&
                    descriptor.ImplementationType?.Namespace == "NetApi.Workers")
                .ToList();

            foreach (var descriptor in workerDescriptors)
            {
                services.Remove(descriptor);
            }
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);

        if (disposing)
        {
            foreach (var pair in originalEnvironmentValues)
            {
                Environment.SetEnvironmentVariable(pair.Key, pair.Value);
            }

            Database.Dispose();
            Directory.SetCurrentDirectory(originalCurrentDirectory);
        }
    }

    private static string AppProjectPath =>
        Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "src", "NetApi"));
}
