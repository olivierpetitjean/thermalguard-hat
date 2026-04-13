using AwesomeAssertions;
using NetApi.Application;
using NetApi.Application.Models;
using NetApi.Domain;
using NetApi.Tests.TestInfrastructure;

namespace NetApi.Tests.Unit;

public class SettingsServiceTests
{
    [Fact]
    public void Update_ShouldReturnFalse_WhenNoSettingsExist()
    {
        using var database = new TestDatabase();
        database.Seed(db =>
        {
            db.GlobalSettings.RemoveRange(db.GlobalSettings);
        });

        using var db = database.CreateContext();
        var service = new SettingsService(db);

        var result = service.Update(new SettingsUpdateModel());

        result.Should().BeFalse();
    }

    [Fact]
    public void Update_ShouldPersistUpdatedValues()
    {
        using var database = new TestDatabase();
        var before = DateTime.Now;

        using (var db = database.CreateContext())
        {
            var service = new SettingsService(db);

            var updated = service.Update(new SettingsUpdateModel
            {
                Auto = false,
                LinkedMode = false,
                Fan1Pwr = 42,
                Fan2Pwr = 64,
                Beep = false,
                SmtpEnable = true,
                Smtp_host = "smtp.example.test",
                SmtpPort = "2525",
                SmtpSender = "alerts@example.test",
                SmtpLogin = "thermalguard",
                SmtpSsl = true
            });

            updated.Should().BeTrue();
        }

        using var verificationDb = database.CreateContext();
        var settings = verificationDb.GlobalSettings.Should().ContainSingle().Subject;

        settings.Auto.Should().BeFalse();
        settings.LinkedMode.Should().BeFalse();
        settings.Fan1Pwr.Should().Be(42);
        settings.Fan2Pwr.Should().Be(64);
        settings.Beep.Should().BeFalse();
        settings.SmtpEnable.Should().BeTrue();
        settings.Smtp_host.Should().Be("smtp.example.test");
        settings.SmtpPort.Should().Be("2525");
        settings.SmtpSender.Should().Be("alerts@example.test");
        settings.SmtpLogin.Should().Be("thermalguard");
        settings.SmtpSsl.Should().BeTrue();
        settings.LastUpdated.Should().BeOnOrAfter(before);
    }

    [Fact]
    public void GetAll_ShouldReturnCurrentSettings()
    {
        using var database = new TestDatabase();
        using var db = database.CreateContext();
        var service = new SettingsService(db);

        var result = service.GetAll();

        result.Should().ContainSingle().Which.Should().BeOfType<GlobalSettings>();
    }
}
