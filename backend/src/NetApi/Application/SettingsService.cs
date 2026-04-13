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

        current.LastUpdated = DateTime.Now;
        current.Auto = settings.Auto;
        current.LinkedMode = settings.LinkedMode;
        current.Fan1Pwr = settings.Fan1Pwr;
        current.Fan2Pwr = settings.Fan2Pwr;
        current.Beep = settings.Beep;
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
}
