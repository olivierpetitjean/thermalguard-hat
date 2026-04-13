namespace NetApi.Application.Models;

public class SystemMetricPoint
{
    public long Ts { get; set; }
    public decimal CpuUsage { get; set; }
    public decimal MemoryUsage { get; set; }
    public decimal DiskUsage { get; set; }
}
