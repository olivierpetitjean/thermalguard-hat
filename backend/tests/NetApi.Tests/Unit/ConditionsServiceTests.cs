using AwesomeAssertions;
using NetApi.Application;
using NetApi.Domain;
using NetApi.Tests.TestInfrastructure;

namespace NetApi.Tests.Unit;

public class ConditionsServiceTests
{
    [Fact]
    public void GetAll_ShouldReturnConditionsOrderedByTemperatures()
    {
        using var database = new TestDatabase();
        database.Seed(db =>
        {
            db.Conditions.RemoveRange(db.Conditions);
            db.Conditions.AddRange(
                new Condition { MinTemp1 = 35, MinTemp2 = 20, Value1 = 10, Value2 = 10 },
                new Condition { MinTemp1 = 25, MinTemp2 = 30, Value1 = 20, Value2 = 20 },
                new Condition { MinTemp1 = 25, MinTemp2 = 10, Value1 = 30, Value2 = 30 });
        });

        using var db = database.CreateContext();
        var service = new ConditionsService(db);

        var result = service.GetAll();

        result.Should().HaveCount(3);
        result.Select(condition => (condition.MinTemp1, condition.MinTemp2))
            .Should()
            .ContainInOrder((25m, 10m), (25m, 30m), (35m, 20m));
    }

    [Fact]
    public void ReplaceAll_ShouldReplaceExistingConditions()
    {
        using var database = new TestDatabase();
        using (var db = database.CreateContext())
        {
            var service = new ConditionsService(db);

            service.ReplaceAll([
                new Condition { MinTemp1 = 22, MinTemp2 = 22, Value1 = 15, Value2 = 15 },
                new Condition { MinTemp1 = 28, MinTemp2 = 28, Value1 = 40, Value2 = 40 }
            ]);
        }

        using var verificationDb = database.CreateContext();
        verificationDb.Conditions.Should().HaveCount(2);
        verificationDb.Conditions.Select(condition => condition.MinTemp1)
            .Should()
            .BeEquivalentTo([22m, 28m]);
    }
}
