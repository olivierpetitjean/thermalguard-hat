using Microsoft.Extensions.Configuration;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Extensions.ManagedClient;
using NetApi.Infrastructure.Systemd;
using System.Text.Json;
using static NetApi.Infrastructure.Systemd.SensorSystemdService;

namespace NetApi.Workers;

public class ServiceWorker : BackgroundService
{
    public ServiceStatus? ServiceStatus { get; set; }

    private readonly IManagedMqttClient mqttClient = new MqttFactory().CreateManagedMqttClient();
    private readonly IConfiguration configuration;

    public ServiceWorker(IConfiguration configuration)
    {
        this.configuration = configuration;

        var mqttHost = this.configuration["BrokerHostSettings:Host"] ?? "localhost";
        var mqttPort = int.TryParse(this.configuration["BrokerHostSettings:Port"], out var parsedPort) ? parsedPort : 1883;
        var mqttUser = this.configuration["BrokerHostSettings:User"];
        var mqttPassword = this.configuration["BrokerHostSettings:Password"];
        var mqttUseTls = bool.TryParse(this.configuration["BrokerHostSettings:UseTls"], out var parsedTls) && parsedTls;

        var mqttBuilder = new MqttClientOptionsBuilder()
            .WithClientId("temperature.web")
            .WithTcpServer(mqttHost, mqttPort);

        if (!string.IsNullOrWhiteSpace(mqttUser))
        {
            mqttBuilder.WithCredentials(mqttUser, mqttPassword);
        }

        if (mqttUseTls)
        {
            mqttBuilder.WithTls();
        }

        var mqttOptions = new ManagedMqttClientOptionsBuilder()
            .WithAutoReconnectDelay(TimeSpan.FromSeconds(60))
            .WithClientOptions(mqttBuilder.Build())
            .Build();

        mqttClient.ConnectedAsync += OnConnectedAsync;
        mqttClient.DisconnectedAsync += OnDisconnectedAsync;
        mqttClient.ConnectingFailedAsync += OnConnectingFailedAsync;

        mqttClient.StartAsync(mqttOptions);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var result = await SensorSystemdService.Status();
            if (ServiceStatus == null)
            {
                ServiceStatus = result.Status;
            }
            else if (result.Status != ServiceStatus)
            {
                ServiceStatus = result.Status;

                if (mqttClient.IsConnected)
                {
                    var json = JsonSerializer.Serialize(new { status = result.Status, time = result.Time });
                    await mqttClient.EnqueueAsync("servicestatuschanged", json);
                }
            }

            await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);
        }
    }

    private Task OnConnectedAsync(MqttClientConnectedEventArgs arg)
    {
        Console.WriteLine("Connected to MQTT broker");
        return Task.CompletedTask;
    }

    private Task OnDisconnectedAsync(MqttClientDisconnectedEventArgs arg)
    {
        Console.WriteLine("Disconnected from MQTT broker");
        return Task.CompletedTask;
    }

    private Task OnConnectingFailedAsync(ConnectingFailedEventArgs arg)
    {
        Console.WriteLine($"Connection failed: {arg.Exception?.Message ?? "check network or MQTT broker."}");
        return Task.CompletedTask;
    }
}
