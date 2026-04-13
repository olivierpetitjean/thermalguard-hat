using Microsoft.AspNetCore.Mvc.Testing;
using NetApi.Infrastructure.Persistence;
using NetApi.Tests.Integration;
using System.Net.Http.Headers;
using System.Security.Claims;

namespace NetApi.Tests.TestInfrastructure;

public abstract class IntegrationTestBase : IDisposable
{
    private readonly NetApiWebApplicationFactory factory;
    private readonly HttpClient client;

    protected IntegrationTestBase(Dictionary<string, string?>? configurationOverrides = null, bool allowAutoRedirect = true)
    {
        factory = new NetApiWebApplicationFactory(configurationOverrides);
        client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = allowAutoRedirect
        });
    }

    protected HttpClient Client => client;

    public HttpClient HttpClient => client;

    protected TestDatabase Database => factory.Database;

    protected string JwtSecret => factory.JwtSecret;

    protected void Seed(Action<AppDbContext> seed)
    {
        Database.Seed(seed);
    }

    protected void Authenticate(params Claim[] extraClaims)
    {
        var claims = new List<Claim> { new(ClaimTypes.Name, "tester") };
        claims.AddRange(extraClaims);

        var token = TestJwtTokenFactory.Create(JwtSecret, claims);
        Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
    }

    public void Dispose()
    {
        client.Dispose();
        factory.Dispose();
    }
}
