using System.ComponentModel.DataAnnotations.Schema;

namespace NetApi.Domain;

public class HistoryRaw
{
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public Guid Id { get; set; }
    public long Ts { get; set; }
    public string Name { get; set; } = string.Empty;
    public decimal Value { get; set; }
}
