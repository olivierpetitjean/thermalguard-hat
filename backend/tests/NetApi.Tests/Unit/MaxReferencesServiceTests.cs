using AwesomeAssertions;
using NetApi.Application;
using NetApi.Tests.TestInfrastructure;

namespace NetApi.Tests.Unit;

public class MaxReferencesServiceTests
{
    [Fact]
    public void GetCurrent_ShouldReturnStoredMaxReferences()
    {
        using var database = new TestDatabase();
        using var db = database.CreateContext();
        var service = new MaxReferencesService(db);

        var result = service.GetCurrent();

        result.Value1.Should().Be(2080);
        result.Value2.Should().Be(2080);
    }

    [Fact]
    public void GetCurrent_ShouldReturnEmptyInstance_WhenNoRowExists()
    {
        using var database = new TestDatabase();
        database.Seed(db =>
        {
            db.MaxReferences.RemoveRange(db.MaxReferences);
        });

        using var db = database.CreateContext();
        var service = new MaxReferencesService(db);

        var result = service.GetCurrent();

        result.Should().NotBeNull();
        result.Value1.Should().Be(0);
        result.Value2.Should().Be(0);
    }
}
