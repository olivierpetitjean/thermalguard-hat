using static NetApi.Api.Controllers.ApiController;
using System.Diagnostics;
using System.Text.RegularExpressions;

namespace NetApi.Infrastructure.Systemd;

public static partial class SensorSystemdService
{
    private static readonly Regex SinceRegex = BuildSinceRegex();
    private const string ServiceName = "thermalguard-hat-sensor";

    public static class CommandText
    {
        public static readonly string Start = "start";
        public static readonly string Stop = "stop";
        public static readonly string Restart = "restart";
        public static readonly string Status = "status";
    }

    public enum ServiceStatus
    {
        Unknown,
        Running,
        Stopped
    }

    public class ExecCommandResult
    {
        public bool Success { get; set; }
        public string? ErrorText { get; set; }
        public string? OutputText { get; set; }
    }

    public class ExecCommandStatus
    {
        public bool Success { get; set; }
        public string? ErrorText { get; set; }
        public string? Time { get; set; }
        public ServiceStatus? Status { get; set; }
    }

    public static async Task<ExecCommandResult> Start()
    {
        var result = await ExecuteCommand(CommandText.Start, ServiceName);
        return new ExecCommandResult
        {
            ErrorText = result.error,
            Success = string.IsNullOrEmpty(result.error?.Trim()),
            OutputText = result.success
        };
    }

    public static async Task<ExecCommandResult> Stop()
    {
        var result = await ExecuteCommand(CommandText.Stop, ServiceName);
        return new ExecCommandResult
        {
            ErrorText = result.error,
            Success = string.IsNullOrEmpty(result.error?.Trim()),
            OutputText = result.success
        };
    }

    public static async Task<ExecCommandResult> Restart()
    {
        var result = await ExecuteCommand(CommandText.Restart, ServiceName);
        return new ExecCommandResult
        {
            ErrorText = result.error,
            Success = string.IsNullOrEmpty(result.error?.Trim()),
            OutputText = result.success
        };
    }

    public static async Task<ExecCommandStatus> Status()
    {
        var result = await ExecuteCommand(CommandText.Status, ServiceName);
        var status = ServiceStatus.Unknown;

        if (result.success != null && result.success.Contains("active (running)"))
        {
            status = ServiceStatus.Running;
        }
        else if (result.success != null && result.success.Contains("inactive (dead)"))
        {
            status = ServiceStatus.Stopped;
        }

        var time = string.Empty;
        if (result.success != null)
        {
            var matches = SinceRegex.Matches(result.success);
            if (matches.Count > 0)
            {
                var timeGroup = matches[0].Groups[2];
                if (timeGroup.Success)
                {
                    time = timeGroup.Value;
                }
            }
        }

        return new ExecCommandStatus
        {
            ErrorText = result.error,
            Success = string.IsNullOrEmpty(result.error?.Trim()),
            Status = status,
            Time = time
        };
    }

    private static async Task<(string? success, string? error)> ExecuteCommand(string commandText, string serviceName)
    {
        var processStartInfo = new ProcessStartInfo
        {
            FileName = "/bin/bash",
            Arguments = $"-c \"sudo systemctl {commandText} {serviceName}\"",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };

        return await Task.Run(() =>
        {
            try
            {
                using var process = new Process();
                process.StartInfo = processStartInfo;
                process.Start();
                process.WaitForExit(10000);

                var output = process.StandardOutput.ReadToEnd();
                var error = process.StandardError.ReadToEnd();

                return (output, error);
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.Message);
                return (string.Empty, ex.Message);
            }
        });
    }

    [GeneratedRegex(@"(since )([^;]*)(;)", RegexOptions.Compiled)]
    private static partial Regex BuildSinceRegex();
}
