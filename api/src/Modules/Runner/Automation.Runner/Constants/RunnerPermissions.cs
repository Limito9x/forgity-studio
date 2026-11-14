using Automation.SharedKernel.Abstractions.Auth;

namespace Automation.Runner.Constants;

public class RunnerPermissions
{
    public static RunnerFeature Runner { get; } = new();

    public Dictionary<string, IReadOnlyList<string>> GetPermissions() => new()
    {
        { "Runner", Runner.All }
    };

    public class RunnerFeature() : BaseCrudPermission("runner") { }
}
