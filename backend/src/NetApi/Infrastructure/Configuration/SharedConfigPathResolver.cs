namespace NetApi.Infrastructure.Configuration;

public static class SharedConfigPathResolver
{
    public static string Resolve()
    {
        var envPath = Environment.GetEnvironmentVariable("THERMALGUARD_HAT_CONFIG_PATH");
        if (!string.IsNullOrWhiteSpace(envPath))
        {
            return envPath;
        }

        var current = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (current is not null)
        {
            var candidate = Path.Combine(current.FullName, "config", "settings.json");
            if (File.Exists(candidate))
            {
                return candidate;
            }

            current = current.Parent;
        }

        return Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "..", "..", "..", "config", "settings.json"));
    }
}
