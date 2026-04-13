using NetApi.Domain;
using NetApi.Infrastructure.Persistence;

namespace NetApi.Application;

public class ConditionsService(AppDbContext db)
{
    private readonly AppDbContext db = db;

    public List<Condition> GetAll()
    {
        // EF Core's SQLite provider does not translate decimal ORDER BY reliably,
        // so materialize first and apply the sort in memory.
        return db.Conditions
            .ToList()
            .OrderBy(condition => condition.MinTemp1)
            .ThenBy(condition => condition.MinTemp2)
            .ToList();
    }

    public void ReplaceAll(List<Condition> conditions)
    {
        db.Conditions.RemoveRange(db.Conditions);
        db.Conditions.AddRange(conditions);
        db.SaveChanges();
    }
}
