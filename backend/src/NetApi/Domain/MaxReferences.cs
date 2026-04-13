using System.ComponentModel.DataAnnotations.Schema;

namespace NetApi.Domain;

public class MaxReferences
{
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public Guid Id { get; set; }
    public DateTime Date { get; set; }
    public decimal Value1 { get; set; }
    public decimal Value2 { get; set; }
}
