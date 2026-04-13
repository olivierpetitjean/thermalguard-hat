using AwesomeAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using NetApi.Domain;
using NetApi.Api.Controllers;
using NetApi.Infrastructure.Persistence;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;

namespace NetApi.Tests.Integration;

public class AuthControllerIntegrationTests : TestInfrastructure.IntegrationTestBase
{
    [Fact]
    public async Task Status_ShouldReportNoAccountInitially()
    {
        var response = await Client.GetFromJsonAsync<StatusResponse>("/api/auth/status");

        response.Should().NotBeNull();
        response!.HasAccount.Should().BeFalse();
    }

    [Fact]
    public async Task Setup_ShouldRejectMissingCredentials()
    {
        var response = await Client.PostAsJsonAsync("/api/auth/setup", new LoginRequest("", ""));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Setup_ShouldCreateUserAndReturnToken()
    {
        var response = await Client.PostAsJsonAsync("/api/auth/setup", new LoginRequest("admin", "secret"));
        var payload = await response.Content.ReadFromJsonAsync<AuthResponse>();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        payload.Should().NotBeNull();
        payload!.Success.Should().BeTrue();
        payload.Token.Should().NotBeNullOrWhiteSpace();

        using var db = Database.CreateContext();
        db.Users.Should().ContainSingle(user => user.Username == "admin");
    }

    [Fact]
    public async Task Login_ShouldRejectInvalidCredentials()
    {
        Seed(db =>
        {
            db.Users.Add(new User
            {
                Username = "admin",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword("secret")
            });
        });

        var response = await Client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin", "wrong"));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Login_ShouldReturnTokenForValidCredentials()
    {
        Seed(db =>
        {
            db.Users.Add(new User
            {
                Username = "admin",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword("secret")
            });
        });

        var response = await Client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin", "secret"));
        var payload = await response.Content.ReadFromJsonAsync<AuthResponse>();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        payload.Should().NotBeNull();
        payload!.Success.Should().BeTrue();
        payload.Token.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public void KioskAccess_ShouldAllowLoopbackAndReturnKioskClaims()
    {
        using var database = new TestInfrastructure.TestDatabase();
        using var db = database.CreateContext();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Auth:JwtSecret"] = "tests-jwt-secret-value-with-sufficient-length",
                ["Auth:TokenExpiryHours"] = "12"
            })
            .Build();
        var controller = new AuthController(db, configuration)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    Connection =
                    {
                        RemoteIpAddress = IPAddress.Loopback
                    }
                }
            }
        };

        var response = controller.KioskAccess();

        response.Should().BeOfType<OkObjectResult>();
        var payload = response.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeOfType<AuthController.AuthResponse>().Subject;
        payload.Success.Should().BeTrue();
        payload.Token.Should().NotBeNullOrWhiteSpace();

        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(payload.Token);
        jwt.Claims.Should().Contain(claim => claim.Type == "rsh_access" && claim.Value == "kiosk");
        jwt.Claims.Should().Contain(claim => claim.Type == "rsh_ip" && claim.Value == "127.0.0.1");
    }

    [Fact]
    public void KioskAccess_ShouldRejectNonWhitelistedRemoteIp()
    {
        using var database = new TestInfrastructure.TestDatabase();
        using var db = database.CreateContext();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Auth:JwtSecret"] = "tests-jwt-secret-value-with-sufficient-length",
                ["Auth:TokenExpiryHours"] = "12"
            })
            .Build();
        var controller = new AuthController(db, configuration)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    Connection =
                    {
                        RemoteIpAddress = IPAddress.Parse("192.168.10.20")
                    }
                }
            }
        };

        var response = controller.KioskAccess();

        response.Should().BeOfType<ObjectResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public void KioskAccess_ShouldAllowWhitelistedRemoteIp()
    {
        using var database = new TestInfrastructure.TestDatabase();
        using var db = database.CreateContext();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Auth:JwtSecret"] = "tests-jwt-secret-value-with-sufficient-length",
                ["Auth:TokenExpiryHours"] = "12",
                ["Kiosk:BypassIPs:0"] = "192.168.10.20"
            })
            .Build();
        var controller = new AuthController(db, configuration)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    Connection =
                    {
                        RemoteIpAddress = IPAddress.Parse("192.168.10.20")
                    }
                }
            }
        };

        var response = controller.KioskAccess();

        response.Should().BeOfType<OkObjectResult>();
    }

    private sealed record LoginRequest(string Username, string Password);

    private sealed class AuthResponse
    {
        public bool Success { get; set; }
        public string? Token { get; set; }
        public string? Error { get; set; }
    }

    private sealed class StatusResponse
    {
        public bool HasAccount { get; set; }
    }
}
