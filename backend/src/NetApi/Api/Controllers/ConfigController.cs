using Microsoft.AspNetCore.Mvc;
using System.Globalization;

namespace NetApi.Api.Controllers
{
    [Route("api/config")]
    [ApiController]
    public class ConfigController : ControllerBase
    {
        private readonly IConfiguration configuration;

        public ConfigController(IConfiguration configuration)
        {
            this.configuration = configuration;
        }

        [HttpGet]
        public IActionResult Get()
        {
            return Ok(new
            {
                MqttPath = "/mqtt",
                Display = new
                {
                    DashboardTitle = configuration["Display:DashboardTitle"] ?? "Dashboard",
                    Sensor1Name = configuration["Display:Sensor1Name"] ?? "Rack",
                    Sensor2Name = configuration["Display:Sensor2Name"] ?? "Ambient",
                    Fan1Name = configuration["Display:Fan1Name"] ?? "Intake Fan",
                    Fan2Name = configuration["Display:Fan2Name"] ?? "Exhaust Fan",
                    Locale = configuration["Display:Locale"] ?? "en-US",
                    TemperatureUnit = configuration["Display:TemperatureUnit"] ?? "C",
                    DisableFanAnimations = bool.TryParse(configuration["Display:DisableFanAnimations"], out var disableFanAnimations) && disableFanAnimations,
                    AirflowUnit = configuration["Display:AirflowUnit"] ?? "m3h",
                    Fan1MaxAirflow = double.TryParse(configuration["Display:Fan1MaxAirflow"], NumberStyles.Float | NumberStyles.AllowThousands, CultureInfo.InvariantCulture, out var fan1MaxAirflow) ? fan1MaxAirflow : 95d,
                    Fan2MaxAirflow = double.TryParse(configuration["Display:Fan2MaxAirflow"], NumberStyles.Float | NumberStyles.AllowThousands, CultureInfo.InvariantCulture, out var fan2MaxAirflow) ? fan2MaxAirflow : 95d
                }
            });
        }
    }
}
