using NetApi.Domain;
using NetApi.Infrastructure.Persistence;
using NetApi.Application.Models;

namespace NetApi.Application;

public class SettingsService(AppDbContext db)
{
    private readonly AppDbContext db = db;

    public List<GlobalSettings> GetAll()
    {
        return db.GlobalSettings.ToList();
    }

    public bool Update(SettingsUpdateModel settings)
    {
        var current = db.GlobalSettings.FirstOrDefault();
        if (current == null)
        {
            return false;
        }

        var controlMode = NormalizeControlMode(settings.ControlMode, settings.LinkedMode);
        var linkedSensor = NormalizeLinkedSensor(settings.LinkedSensor);
        var differentialMode = NormalizeDifferentialMode(settings.DifferentialMode);

        current.LastUpdated = DateTime.Now;
        current.Auto = settings.Auto;
        current.LinkedMode = controlMode != "independent";
        current.ControlMode = controlMode;
        current.LinkedSensor = linkedSensor;
        current.DifferentialMode = differentialMode;
        current.Fan1Pwr = settings.Fan1Pwr;
        current.Fan2Pwr = settings.Fan2Pwr;
        current.Beep = settings.Beep;
        current.DisableFanAlerts = settings.DisableFanAlerts;
        // SMTP settings are stored for a future version; email notifications are not implemented yet.
        current.SmtpEnable = settings.SmtpEnable;
        current.Smtp_host = settings.Smtp_host;
        current.SmtpPort = settings.SmtpPort;
        current.SmtpSender = settings.SmtpSender;
        current.SmtpLogin = settings.SmtpLogin;
        current.SmtpSsl = settings.SmtpSsl;

        db.SaveChanges();
        return true;
    }

    private static string NormalizeControlMode(string? controlMode, bool linkedMode)
    {
        return controlMode?.Trim().ToLowerInvariant() switch
        {
            "linked_fans" => "linked_fans",
            "independent" => "independent",
            "differential" => "differential",
            _ => linkedMode ? "linked_fans" : "independent"
        };
    }

    private static string NormalizeLinkedSensor(string? linkedSensor)
    {
        return linkedSensor?.Trim().ToLowerInvariant() switch
        {
            "sensor2" => "sensor2",
            _ => "sensor1"
        };
    }

    private static string NormalizeDifferentialMode(string? differentialMode)
    {
        return differentialMode?.Trim().ToLowerInvariant() switch
        {
            "sensor2_minus_sensor1" => "sensor2_minus_sensor1",
            _ => "sensor1_minus_sensor2"
        };
    }
}
