using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using NetApi.Application;
using NetApi.Infrastructure.Persistence;
using NetApi.Workers;
using System.Text;

namespace NetApi.Infrastructure.Startup;

public static class ServiceCollectionExtensions
{
    public const string ConfiguredOriginsCorsPolicy = "configured-origins";

    public static IServiceCollection AddAppWorkers(this IServiceCollection services)
    {
        services.AddHostedService<ServiceWorker>();
        services.AddHostedService<MetricsAggregationWorker>();
        services.AddHostedService<CleanerWorker>();
        services.AddHostedService<SystemMetricsWorker>();
        return services;
    }

    public static IServiceCollection AddConfiguredCors(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddCors(options =>
        {
            options.AddPolicy(ConfiguredOriginsCorsPolicy, policy =>
            {
                var allowedOrigins = configuration["AllowedOrigins"]?.Split(",", StringSplitOptions.RemoveEmptyEntries)
                                     ?? Array.Empty<string>();

                policy.WithOrigins(allowedOrigins)
                      .AllowAnyMethod()
                      .AllowAnyHeader();
            });
        });

        return services;
    }

    public static IServiceCollection AddPersistence(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<AppDbContext>(options =>
        {
            var connectionString = configuration.GetConnectionString("WebApiDatabase");
            options.UseSqlite(connectionString);
        });

        return services;
    }

    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        services.AddScoped<HistoryQueryService>();
        services.AddScoped<SystemMetricsQueryService>();
        services.AddScoped<SettingsService>();
        services.AddScoped<ConditionsService>();
        services.AddScoped<MaxReferencesService>();
        return services;
    }

    public static IServiceCollection AddApiControllers(this IServiceCollection services)
    {
        services.AddControllers().AddJsonOptions(options =>
        {
            options.JsonSerializerOptions.PropertyNamingPolicy = null;
        });

        return services;
    }

    public static IServiceCollection AddAppAuthentication(this IServiceCollection services, IConfiguration configuration)
    {
        var jwtSecret = configuration["Auth:JwtSecret"]!;

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = false,
                    ValidateAudience = false,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret))
                };
            });

        services.AddAuthorization();
        return services;
    }

    public static IServiceCollection AddMqttReverseProxy(this IServiceCollection services, IConfiguration configuration)
    {
        var mqttHost = configuration["BrokerHostSettings:Host"]!;
        var mqttWsPort = configuration["BrokerHostSettings:WsPort"]!;
        var mqttUseTls = bool.TryParse(configuration["BrokerHostSettings:UseTls"], out var useTls) && useTls;
        var mqttWsScheme = mqttUseTls ? "wss" : "ws";

        configuration["ReverseProxy:Clusters:mqtt-cluster:Destinations:mqtt:Address"] =
            $"{mqttWsScheme}://{mqttHost}:{mqttWsPort}";

        services.AddReverseProxy()
            .LoadFromConfig(configuration.GetSection("ReverseProxy"));

        return services;
    }
}
