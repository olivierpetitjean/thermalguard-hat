using AwesomeAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using NetApi.Tests.TestInfrastructure;
using System.Net;
using System.Security.Claims;

namespace NetApi.Tests.Integration;

public class MqttProxyTokenValidationIntegrationTests : TestInfrastructure.IntegrationTestBase
{
    public MqttProxyTokenValidationIntegrationTests() : base(allowAutoRedirect: false)
    {
    }

    [Fact]
    public async Task MqttProxy_ShouldRejectMissingToken()
    {
        var response = await Client.GetAsync("/mqtt");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task MqttProxy_ShouldRejectInvalidToken()
    {
        var response = await Client.GetAsync("/mqtt?token=invalid-token");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task MqttProxy_ShouldAcceptValidToken()
    {
        var token = TestJwtTokenFactory.Create(JwtSecret, [new Claim(ClaimTypes.Name, "tester")]);

        var response = await Client.GetAsync($"/mqtt?token={token}");

        response.StatusCode.Should().NotBe(HttpStatusCode.Unauthorized);
    }
}
