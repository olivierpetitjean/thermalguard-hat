using System.ComponentModel.DataAnnotations.Schema;

namespace NetApi.Domain
{
    public class GlobalSettings
    {
        public GlobalSettings()
        {
            Id = Guid.NewGuid();
            LastUpdated = DateTime.Now;
            Auto = true;
            Fan1Pwr = 15;
            Fan2Pwr = 15;
            Beep = true;
            SmtpEnable = false;
        }

        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }
        public DateTime LastUpdated { get; set; }
        public bool Auto { get; set; }
        public bool LinkedMode { get; set; }
        public int Fan1Pwr { get; set; }
        public int Fan2Pwr { get; set; }
        public bool SmtpEnable { get; set; }
        public bool Beep { get; set; }
        public string? Smtp_host { get; set; }
        public string? SmtpPort { get; set; }
        public string? SmtpSender { get; set; }
        public string? SmtpLogin { get; set; }
        public bool? SmtpSsl { get; set; }
    }
}
