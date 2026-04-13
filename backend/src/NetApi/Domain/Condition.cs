using System.ComponentModel.DataAnnotations.Schema;

namespace NetApi.Domain
{
    public class Condition
    {
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }
        public decimal MinTemp1 { get; set; }
        public decimal MinTemp2 { get; set; }
        public int Value1 { get; set; }
        public int Value2 { get; set; }
    }
}
