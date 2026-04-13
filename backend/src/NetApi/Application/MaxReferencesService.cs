using NetApi.Domain;
using NetApi.Infrastructure.Persistence;

namespace NetApi.Application;

public class MaxReferencesService(AppDbContext db)
{
    private readonly AppDbContext db = db;

    public MaxReferences GetCurrent()
    {
        return db.MaxReferences.FirstOrDefault() ?? new MaxReferences();
    }
}
