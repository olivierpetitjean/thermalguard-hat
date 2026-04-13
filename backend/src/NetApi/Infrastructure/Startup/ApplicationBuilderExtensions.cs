using Microsoft.EntityFrameworkCore;
using Microsoft.Data.Sqlite;
using Microsoft.IdentityModel.Tokens;
using NetApi.Infrastructure.Persistence;
using System.IdentityModel.Tokens.Jwt;
using System.Text;

namespace NetApi.Infrastructure.Startup;

public static class ApplicationBuilderExtensions
{
    public static WebApplication InitializeDatabase(this WebApplication app)
    {
        var dbPath = app.Configuration.GetConnectionString("WebApiDatabase")!
            .Replace("Data Source=", "", StringComparison.OrdinalIgnoreCase)
            .Trim();

        var dbDir = Path.GetDirectoryName(Path.GetFullPath(dbPath));
        if (dbDir is not null)
        {
            Directory.CreateDirectory(dbDir);
        }

        using var scope = app.Services.CreateScope();
        using var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        try
        {
            Console.WriteLine("Trying create DB");
            db.Database.EnsureCreated();
            using var connection = new SqliteConnection(db.Database.GetConnectionString()!);
            AppDbContext.EnsureSupplementalSchema(connection);
            SqliteSchemaUpgrader.UpgradeLegacySchema(db.Database.GetConnectionString()!);
            Console.WriteLine("DB Creation OK");
        }
        catch (Exception ex)
        {
            Console.WriteLine(ex);
        }

        return app;
    }

    public static IApplicationBuilder UseMqttProxyTokenValidation(this IApplicationBuilder app, string jwtSecret)
    {
        app.Use(async (context, next) =>
        {
            if (context.Request.Path.StartsWithSegments("/mqtt"))
            {
                var token = context.Request.Query["token"].ToString();
                if (string.IsNullOrEmpty(token))
                {
                    context.Response.StatusCode = 401;
                    return;
                }

                var tokenHandler = new JwtSecurityTokenHandler();
                var key = Encoding.UTF8.GetBytes(jwtSecret);

                try
                {
                    tokenHandler.ValidateToken(token, new TokenValidationParameters
                    {
                        ValidateIssuerSigningKey = true,
                        IssuerSigningKey = new SymmetricSecurityKey(key),
                        ValidateIssuer = false,
                        ValidateAudience = false,
                        ValidateLifetime = true,
                        ClockSkew = TimeSpan.Zero
                    }, out _);
                }
                catch
                {
                    context.Response.StatusCode = 401;
                    return;
                }
            }

            await next();
        });

        return app;
    }
}
