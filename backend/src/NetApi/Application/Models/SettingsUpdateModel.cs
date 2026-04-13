namespace NetApi.Application.Models;

public class SettingsUpdateModel
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
