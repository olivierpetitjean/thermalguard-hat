using NetApi.Infrastructure.Configuration;
using NetApi.Infrastructure.Startup;

Console.WriteLine("Starting program...");

var options = new WebApplicationOptions
{
    Args = args,
    ContentRootPath = Directory.GetCurrentDirectory(),
    WebRootPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot")
};

Console.WriteLine("ContentRootPath: " + options.ContentRootPath);
Console.WriteLine("WebRootPath: " + options.WebRootPath);

var builder = WebApplication.CreateBuilder(options);

var sharedConfigPath = SharedConfigPathResolver.Resolve();
builder.Configuration.AddJsonFile(sharedConfigPath, optional: true, reloadOnChange: false);
Console.WriteLine($"SharedConfigPath: {sharedConfigPath}");

builder.Host.UseSystemd();

builder.Services
    .AddAppWorkers()
    .AddApiControllers()
    .AddConfiguredCors(builder.Configuration)
    .AddPersistence(builder.Configuration)
    .AddApplicationServices()
    .AddAppAuthentication(builder.Configuration)
    .AddMqttReverseProxy(builder.Configuration);

var app = builder.Build();
var jwtSecret = builder.Configuration["Auth:JwtSecret"]!;

app.InitializeDatabase();

app.UseDefaultFiles();
app.UseStaticFiles();

if (app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseCors(ServiceCollectionExtensions.ConfiguredOriginsCorsPolicy);
app.UseAuthentication();
app.UseAuthorization();
app.UseWebSockets();
app.UseMqttProxyTokenValidation(jwtSecret);

app.MapReverseProxy();
app.MapControllers();
app.MapFallbackToFile("{*path:nonfile}", "index.html");
app.UseHttpMethodOverride();

app.Run();

public partial class Program;
