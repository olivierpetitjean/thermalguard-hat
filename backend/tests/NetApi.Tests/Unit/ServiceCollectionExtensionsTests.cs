using AwesomeAssertions;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using NetApi.Application;
using NetApi.Infrastructure.Startup;
using Yarp.ReverseProxy.Configuration;

namespace NetApi.Tests.Unit;

public class ServiceCollectionExtensionsTests
{
    [Fact]
    public void AddConfiguredCors_ShouldRegisterConfiguredOriginsPolicy()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AllowedOrigins"] = "http://localhost:4200,https://thermalguard.local"
            })
            .Build();
        var services = new ServiceCollection();

        services.AddConfiguredCors(configuration);

        using var provider = services.BuildServiceProvider();
        var corsOptions = provider.GetRequiredService<IOptions<CorsOptions>>().Value;
        corsOptions.GetPolicy(ServiceCollectionExtensions.ConfiguredOriginsCorsPolicy).Should().NotBeNull();
    }

    [Theory]
    [InlineData("false", "ws://broker.local:9001")]
    [InlineData("true", "wss://broker.local:9001")]
    public void AddMqttReverseProxy_ShouldComputeDestinationAddress(string useTls, string expectedAddress)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["BrokerHostSettings:Host"] = "broker.local",
                ["BrokerHostSettings:WsPort"] = "9001",
                ["BrokerHostSettings:UseTls"] = useTls,
                ["ReverseProxy:Routes:mqtt-route:ClusterId"] = "mqtt-cluster",
                ["ReverseProxy:Routes:mqtt-route:Match:Path"] = "/mqtt",
                ["ReverseProxy:Clusters:mqtt-cluster:Destinations:mqtt:Address"] = ""
            })
            .Build();
        var services = new ServiceCollection();

        services.AddMqttReverseProxy(configuration);

        configuration["ReverseProxy:Clusters:mqtt-cluster:Destinations:mqtt:Address"]
            .Should()
            .Be(expectedAddress);
    }

    [Fact]
    public void AddApplicationServices_ShouldRegisterCoreScopedServices()
    {
        var services = new ServiceCollection();

        services.AddApplicationServices();

        services.Should().Contain(descriptor =>
            descriptor.ServiceType == typeof(HistoryQueryService) &&
            descriptor.Lifetime == ServiceLifetime.Scoped);
        services.Should().Contain(descriptor =>
            descriptor.ServiceType == typeof(SystemMetricsQueryService) &&
            descriptor.Lifetime == ServiceLifetime.Scoped);
        services.Should().Contain(descriptor =>
            descriptor.ServiceType == typeof(SettingsService) &&
            descriptor.Lifetime == ServiceLifetime.Scoped);
        services.Should().Contain(descriptor =>
            descriptor.ServiceType == typeof(ConditionsService) &&
            descriptor.Lifetime == ServiceLifetime.Scoped);
        services.Should().Contain(descriptor =>
            descriptor.ServiceType == typeof(MaxReferencesService) &&
            descriptor.Lifetime == ServiceLifetime.Scoped);
    }
}
