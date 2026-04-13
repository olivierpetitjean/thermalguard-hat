using System.ComponentModel.DataAnnotations.Schema;

namespace NetApi.Domain;

public abstract class ValueReference
{
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public Guid Id { get; set; }
    public long Ts { get; set; }
    public string Name { get; set; } = string.Empty;
    public decimal Agregate { get; set; }
    public decimal Divider { get; set; }
    public decimal Min { get; set; }
    public decimal Max { get; set; }
}

public class DayValueReference : ValueReference { }
public class HourValueReference : ValueReference { }
public class PeriodValueReference : ValueReference { }

public abstract class ValueReferenceView
{
    public long Ts { get; set; }
    public string Name { get; set; } = string.Empty;
    public decimal Avg { get; set; }
    public decimal Min { get; set; }
    public decimal Max { get; set; }
}

public class DayValueReferenceView : ValueReferenceView { }
public class HourValueReferenceView : ValueReferenceView { }
public class PeriodValueReferenceView : ValueReferenceView { }
