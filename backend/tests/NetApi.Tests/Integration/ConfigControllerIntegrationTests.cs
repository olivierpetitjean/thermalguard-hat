using AwesomeAssertions;
using System.Net.Http.Json;

namespace NetApi.Tests.Integration;

public class ConfigControllerIntegrationTests : TestInfrastructure.IntegrationTestBase
{
    [Fact]
    public async Task Get_ShouldReturnDefaultDisplayConfiguration_WhenKeysAreMissing()
    {
        var response = await Client.GetFromJsonAsync<ConfigResponse>("/api/config");

        response.Should().NotBeNull();
        response!.MqttPath.Should().Be("/mqtt");
        response.Display.DashboardTitle.Should().Be("Dashboard");
        response.Display.Sensor1Name.Should().Be("Rack");
        response.Display.Sensor2Name.Should().Be("Ambient");
        response.Display.TemperatureUnit.Should().Be("C");
        response.Display.AirflowUnit.Should().Be("m3h");
        response.Display.Fan1MaxAirflow.Should().Be(95);
        response.Display.Fan2MaxAirflow.Should().Be(95);
        response.Display.DisableFanAnimations.Should().BeFalse();
    }

    [Fact]
    public async Task Get_ShouldReturnConfiguredDisplayValues_WhenOverridesAreProvided()
    {
        using var test = new ConfigControllerIntegrationTestsWithOverrides();
        var response = await test.HttpClient.GetFromJsonAsync<ConfigResponse>("/api/config");

        response.Should().NotBeNull();
        response!.Display.DashboardTitle.Should().Be("ThermalGuard Rack");
        response.Display.Sensor1Name.Should().Be("Top");
        response.Display.Sensor2Name.Should().Be("Bottom");
        response.Display.TemperatureUnit.Should().Be("F");
        response.Display.DisableFanAnimations.Should().BeTrue();
        response.Display.AirflowUnit.Should().Be("cfm");
        response.Display.Fan1MaxAirflow.Should().Be(120.5);
        response.Display.Fan2MaxAirflow.Should().Be(130.5);
    }

    private sealed class ConfigControllerIntegrationTestsWithOverrides : TestInfrastructure.IntegrationTestBase
    {
        public ConfigControllerIntegrationTestsWithOverrides() : base(new Dictionary<string, string?>
        {
            ["Display:DashboardTitle"] = "ThermalGuard Rack",
            ["Display:Sensor1Name"] = "Top",
            ["Display:Sensor2Name"] = "Bottom",
            ["Display:TemperatureUnit"] = "F",
            ["Display:DisableFanAnimations"] = "true",
            ["Display:AirflowUnit"] = "cfm",
            ["Display:Fan1MaxAirflow"] = "120.5",
            ["Display:Fan2MaxAirflow"] = "130.5"
        })
        {
        }
    }

    private sealed class ConfigResponse
    {
        public string MqttPath { get; set; } = string.Empty;
        public DisplayResponse Display { get; set; } = new();
    }

    private sealed class DisplayResponse
    {
        public string DashboardTitle { get; set; } = string.Empty;
        public string Sensor1Name { get; set; } = string.Empty;
        public string Sensor2Name { get; set; } = string.Empty;
        public string Fan1Name { get; set; } = string.Empty;
        public string Fan2Name { get; set; } = string.Empty;
        public string Locale { get; set; } = string.Empty;
        public string TemperatureUnit { get; set; } = string.Empty;
        public bool DisableFanAnimations { get; set; }
        public string AirflowUnit { get; set; } = string.Empty;
        public double Fan1MaxAirflow { get; set; }
        public double Fan2MaxAirflow { get; set; }
    }
}
