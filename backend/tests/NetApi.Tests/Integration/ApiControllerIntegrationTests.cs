using AwesomeAssertions;
using NetApi.Domain;
using NetApi.Tests.TestInfrastructure;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;

namespace NetApi.Tests.Integration;

public class ApiControllerIntegrationTests : IntegrationTestBase
{
    [Fact]
    public async Task Settings_Conditions_And_MaxReferences_ShouldReturnSeededData()
    {
        Authenticate();

        var settingsResponse = await Client.GetFromJsonAsync<GenericListResponse<GlobalSettings>>("/api/settings");
        var conditionsResponse = await Client.GetFromJsonAsync<GenericListResponse<Condition>>("/api/conditions");
        var maxReferencesResponse = await Client.GetFromJsonAsync<GenericSingleResponse<MaxReferences>>("/api/maxreferences");

        settingsResponse.Should().NotBeNull();
        settingsResponse!.Success.Should().BeTrue();
        settingsResponse.Data.Should().ContainSingle();

        conditionsResponse.Should().NotBeNull();
        conditionsResponse!.Success.Should().BeTrue();
        conditionsResponse.Data.Should().NotBeNullOrEmpty();

        maxReferencesResponse.Should().NotBeNull();
        maxReferencesResponse!.Success.Should().BeTrue();
        maxReferencesResponse.Data.Should().NotBeNull();
    }

    [Fact]
    public async Task UpdateSettings_ShouldRejectKioskAccess()
    {
        Authenticate(new Claim("rsh_access", "kiosk"));

        var response = await Client.PostAsJsonAsync("/api/settings", new
        {
            Auto = false,
            LinkedMode = false,
            ControlMode = "independent",
            LinkedSensor = "sensor1",
            DifferentialMode = "sensor1_minus_sensor2",
            Fan1Pwr = 25,
            Fan2Pwr = 35,
            Beep = false,
            SmtpEnable = false
        });

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task GraphAndSystemInfoEndpoints_ShouldReturnMappedData()
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var from = now - 7200;
        var to = now;

        Seed(db =>
        {
            db.DayValueReference.RemoveRange(db.DayValueReference);
            db.DayValueReference.Add(new DayValueReference
            {
                Ts = now - 3600,
                Name = "sensor1",
                Agregate = 50,
                Divider = 2,
                Min = 20,
                Max = 30
            });

            db.SystemMetricSamples.RemoveRange(db.SystemMetricSamples);
            db.SystemMetricSamples.AddRange(
                new SystemMetricSample { Ts = now - 120, CpuUsage = 12, MemoryUsage = 34, DiskUsage = 56 },
                new SystemMetricSample { Ts = now - 60, CpuUsage = 22, MemoryUsage = 44, DiskUsage = 66 });
        });

        Authenticate();

        var graphResponse = await Client.GetFromJsonAsync<List<HistoryDto>>($"/api/graph/daily/sensor1/{from}/{to}");
        var systemResponse = await Client.GetFromJsonAsync<List<SystemMetricDto>>("/api/systeminfo/1h");

        graphResponse.Should().ContainSingle();
        graphResponse![0].Name.Should().Be("sensor1");
        graphResponse[0].Value.Should().Be(25);
        graphResponse[0].MinValue.Should().Be(20);
        graphResponse[0].MaxValue.Should().Be(30);

        systemResponse.Should().NotBeNullOrEmpty();
        systemResponse!.Should().BeInAscendingOrder(item => item.Ts);
    }

    private sealed class GenericListResponse<T>
    {
        public bool Success { get; set; }
        public List<T>? Data { get; set; }
    }

    private sealed class GenericSingleResponse<T>
    {
        public bool Success { get; set; }
        public T? Data { get; set; }
    }

    private sealed class HistoryDto
    {
        public long Ts { get; set; }
        public string Name { get; set; } = string.Empty;
        public decimal Value { get; set; }
        public decimal MinValue { get; set; }
        public decimal MaxValue { get; set; }
    }

    private sealed class SystemMetricDto
    {
        public long Ts { get; set; }
        public decimal CpuUsage { get; set; }
        public decimal MemoryUsage { get; set; }
        public decimal DiskUsage { get; set; }
    }
}
