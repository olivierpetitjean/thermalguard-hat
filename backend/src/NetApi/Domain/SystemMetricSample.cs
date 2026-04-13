using System.ComponentModel.DataAnnotations.Schema;

namespace NetApi.Domain;

public class SystemMetricSample
{
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public Guid Id { get; set; }
    public long Ts { get; set; }
    public decimal CpuUsage { get; set; }
    public decimal MemoryUsage { get; set; }
    public decimal DiskUsage { get; set; }
}
