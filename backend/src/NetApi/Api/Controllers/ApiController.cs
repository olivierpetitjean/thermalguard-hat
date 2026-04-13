using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NetApi.Application;
using NetApi.Application.Models;
using NetApi.Domain;
using NetApi.Infrastructure.Systemd;
using static NetApi.Infrastructure.Systemd.SensorSystemdService;

namespace NetApi.Api.Controllers;

[Authorize]
[Route("api")]
[ApiController]
public class ApiController : ControllerBase
{
    public class GenericResponse
    {
        public bool Success { get; set; }
        public string? ErrorText { get; set; }
    }

    public class GenericResponse<T>
    {
        public bool Success { get; set; }
        public List<T>? Data { get; set; }
        public string? ErrorText { get; set; }
    }

    public class GenericSingleResponse<T>
    {
        public bool Success { get; set; }
        public T? Data { get; set; }
        public string? ErrorText { get; set; }
    }

    public class ServiceStatusResult
    {
        public ServiceStatus Status { get; set; }
        public string Time { get; set; } = string.Empty;
    }

    public class SettingsUpdateDto
    {
        public bool Auto { get; set; }
        public bool LinkedMode { get; set; }
        public int Fan1Pwr { get; set; }
        public int Fan2Pwr { get; set; }
        public bool Beep { get; set; }
        public bool SmtpEnable { get; set; }
        public string? Smtp_host { get; set; }
        public string? SmtpPort { get; set; }
        public string? SmtpSender { get; set; }
        public string? SmtpLogin { get; set; }
        public bool? SmtpSsl { get; set; }
    }

    public class HistoryDto
    {
        public long Ts { get; set; }
        public string Name { get; set; } = string.Empty;
        public decimal Value { get; set; }
        public decimal MinValue { get; set; }
        public decimal MaxValue { get; set; }
    }

    public class SystemMetricDto
    {
        public long Ts { get; set; }
        public decimal CpuUsage { get; set; }
        public decimal MemoryUsage { get; set; }
        public decimal DiskUsage { get; set; }
    }

    private readonly HistoryQueryService historyQueryService;
    private readonly SystemMetricsQueryService systemMetricsQueryService;
    private readonly SettingsService settingsService;
    private readonly ConditionsService conditionsService;
    private readonly MaxReferencesService maxReferencesService;

    public ApiController(
        HistoryQueryService historyQueryService,
        SystemMetricsQueryService systemMetricsQueryService,
        SettingsService settingsService,
        ConditionsService conditionsService,
        MaxReferencesService maxReferencesService)
    {
        this.historyQueryService = historyQueryService;
        this.systemMetricsQueryService = systemMetricsQueryService;
        this.settingsService = settingsService;
        this.conditionsService = conditionsService;
        this.maxReferencesService = maxReferencesService;
    }

    private bool IsKioskAccess()
    {
        return User.HasClaim("rsh_access", "kiosk");
    }

    [HttpGet("graph/{time}/{sensor}/{from}/{to}")]
    public IActionResult GetPeriod(string time, string sensor, long from, long to)
    {
        try
        {
            var sensors = sensor.Split(',').Select(s => s.Trim());
            var data = historyQueryService
                .GetGraph(time, sensors, from, to)
                .Select(MapHistoryDto)
                .ToList();

            return Ok(data);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new GenericResponse { Success = false, ErrorText = ex.Message });
        }
    }

    [HttpGet("systeminfo/{window}")]
    public IActionResult GetSystemInfo(string window)
    {
        try
        {
            var result = systemMetricsQueryService
                .GetWindow(window)
                .Select(point => new SystemMetricDto
                {
                    Ts = point.Ts,
                    CpuUsage = point.CpuUsage,
                    MemoryUsage = point.MemoryUsage,
                    DiskUsage = point.DiskUsage
                })
                .ToList();

            return Ok(result);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new GenericResponse { Success = false, ErrorText = ex.Message });
        }
    }

    [HttpGet]
    [Route("settings")]
    public GenericResponse<GlobalSettings> Settings()
    {
        return new GenericResponse<GlobalSettings>
        {
            Data = settingsService.GetAll(),
            Success = true
        };
    }

    [HttpPost]
    [Route("settings")]
    public IActionResult UpdateSettings([FromBody] SettingsUpdateDto settings)
    {
        try
        {
            if (IsKioskAccess())
            {
                return StatusCode(403, new GenericResponse { Success = false, ErrorText = "Kiosk access is read-only." });
            }

            var updated = settingsService.Update(new SettingsUpdateModel
            {
                Auto = settings.Auto,
                LinkedMode = settings.LinkedMode,
                Fan1Pwr = settings.Fan1Pwr,
                Fan2Pwr = settings.Fan2Pwr,
                Beep = settings.Beep,
                SmtpEnable = settings.SmtpEnable,
                Smtp_host = settings.Smtp_host,
                SmtpPort = settings.SmtpPort,
                SmtpSender = settings.SmtpSender,
                SmtpLogin = settings.SmtpLogin,
                SmtpSsl = settings.SmtpSsl
            });

            if (!updated)
            {
                return StatusCode(500, new GenericResponse { Success = false, ErrorText = "Unable to load settings" });
            }

            return Ok(new GenericResponse { Success = true });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new GenericResponse { Success = false, ErrorText = ex.Message });
        }
    }

    [HttpGet]
    [Route("conditions")]
    public GenericResponse<Condition> Conditions()
    {
        return new GenericResponse<Condition>
        {
            Data = conditionsService.GetAll(),
            Success = true
        };
    }

    [HttpPost]
    [Route("conditions")]
    public IActionResult Condition(List<Condition> conditions)
    {
        try
        {
            if (IsKioskAccess())
            {
                return StatusCode(403, new GenericResponse { Success = false, ErrorText = "Kiosk access is read-only." });
            }

            conditionsService.ReplaceAll(conditions);
            return Ok(new GenericResponse { Success = true });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new GenericResponse { Success = false, ErrorText = ex.Message });
        }
    }

    [HttpGet]
    [Route("servicestatus")]
    public async Task<GenericSingleResponse<ServiceStatusResult>> GetServiceStatus()
    {
        var result = await SensorSystemdService.Status();

        return new GenericSingleResponse<ServiceStatusResult>
        {
            Data = new ServiceStatusResult
            {
                Status = result.Status ?? ServiceStatus.Unknown,
                Time = result.Time ?? string.Empty
            },
            Success = string.IsNullOrEmpty(result.ErrorText?.Trim()),
            ErrorText = result.ErrorText ?? string.Empty
        };
    }

    [HttpGet]
    [Route("servicestart")]
    public async Task<GenericSingleResponse<ServiceStatusResult>> ServiceStart()
    {
        if (IsKioskAccess())
            return new GenericSingleResponse<ServiceStatusResult> { Success = false, ErrorText = "Kiosk access is read-only." };

        var startResult = await SensorSystemdService.Start();
        if (!string.IsNullOrEmpty(startResult?.ErrorText?.Trim()))
            return new GenericSingleResponse<ServiceStatusResult> { ErrorText = startResult.ErrorText };

        await Task.Delay(2000);

        var status = await SensorSystemdService.Status();

        return new GenericSingleResponse<ServiceStatusResult>
        {
            Data = new ServiceStatusResult
            {
                Status = status.Status ?? ServiceStatus.Unknown,
                Time = status.Time ?? string.Empty
            },
            Success = string.IsNullOrEmpty(status.ErrorText?.Trim()),
            ErrorText = status.ErrorText ?? string.Empty
        };
    }

    [HttpGet]
    [Route("servicestop")]
    public async Task<GenericSingleResponse<ServiceStatusResult>> ServiceStop()
    {
        if (IsKioskAccess())
            return new GenericSingleResponse<ServiceStatusResult> { Success = false, ErrorText = "Kiosk access is read-only." };

        var startResult = await SensorSystemdService.Stop();
        if (!string.IsNullOrEmpty(startResult?.ErrorText?.Trim()))
            return new GenericSingleResponse<ServiceStatusResult> { ErrorText = startResult.ErrorText };

        await Task.Delay(2000);

        var status = await SensorSystemdService.Status();

        return new GenericSingleResponse<ServiceStatusResult>
        {
            Data = new ServiceStatusResult
            {
                Status = status.Status ?? ServiceStatus.Unknown,
                Time = status.Time ?? string.Empty
            },
            Success = string.IsNullOrEmpty(status.ErrorText?.Trim()),
            ErrorText = status.ErrorText ?? string.Empty
        };
    }

    [HttpGet]
    [Route("servicerestart")]
    public async Task<GenericSingleResponse<ServiceStatusResult>> ServiceRestart()
    {
        if (IsKioskAccess())
            return new GenericSingleResponse<ServiceStatusResult> { Success = false, ErrorText = "Kiosk access is read-only." };

        var startResult = await SensorSystemdService.Restart();
        if (!string.IsNullOrEmpty(startResult?.ErrorText?.Trim()))
            return new GenericSingleResponse<ServiceStatusResult> { ErrorText = startResult.ErrorText };

        await Task.Delay(2000);

        var status = await SensorSystemdService.Status();

        return new GenericSingleResponse<ServiceStatusResult>
        {
            Data = new ServiceStatusResult
            {
                Status = status.Status ?? ServiceStatus.Unknown,
                Time = status.Time ?? string.Empty
            },
            Success = string.IsNullOrEmpty(status.ErrorText?.Trim()),
            ErrorText = status.ErrorText ?? string.Empty
        };
    }

    [HttpGet]
    [Route("maxreferences")]
    public GenericSingleResponse<MaxReferences> MaxReferences()
    {
        return new GenericSingleResponse<MaxReferences>
        {
            Data = maxReferencesService.GetCurrent(),
            Success = true
        };
    }

    private static HistoryDto MapHistoryDto(HistoryPoint point)
    {
        return new HistoryDto
        {
            Ts = point.Ts,
            Name = point.Name,
            MaxValue = point.MaxValue,
            MinValue = point.MinValue,
            Value = point.Value
        };
    }
}
