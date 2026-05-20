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
            LinkedMode = true;
            ControlMode = "linked_fans";
            LinkedSensor = "sensor1";
            DifferentialMode = "sensor1_minus_sensor2";
            Fan1Pwr = 15;
            Fan2Pwr = 15;
            Beep = true;
            DisableFanAlerts = false;
            SmtpEnable = false;
        }

        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }
        public DateTime LastUpdated { get; set; }
        public bool Auto { get; set; }
        public bool LinkedMode { get; set; }
        public string ControlMode { get; set; }
        public string LinkedSensor { get; set; }
        public string DifferentialMode { get; set; }
        public int Fan1Pwr { get; set; }
        public int Fan2Pwr { get; set; }
        public bool SmtpEnable { get; set; }
        public bool Beep { get; set; }
        public bool DisableFanAlerts { get; set; }
        public string? Smtp_host { get; set; }
        public string? SmtpPort { get; set; }
        public string? SmtpSender { get; set; }
        public string? SmtpLogin { get; set; }
        public bool? SmtpSsl { get; set; }
    }
}
