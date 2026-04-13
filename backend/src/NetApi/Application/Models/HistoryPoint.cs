namespace NetApi.Application.Models;

public class HistoryPoint
{
    public long Ts { get; set; }
    public string Name { get; set; } = string.Empty;
    public decimal Value { get; set; }
    public decimal MinValue { get; set; }
    public decimal MaxValue { get; set; }
}
