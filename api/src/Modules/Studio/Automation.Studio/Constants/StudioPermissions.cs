using Automation.SharedKernel.Abstractions.Auth;

namespace Automation.Studio.Constants;

public class StudioPermissions
{
    public static ProjectFeature Project { get; } = new();
    public static StudioFeature Studio { get; } = new();

    public Dictionary<string, IReadOnlyList<string>> GetPermissions() => new()
    {
        { "Project", Project.All },
        { "Studio", Studio.All }
    };

    public class ProjectFeature() : BaseCrudPermission("projects") { }
    public class StudioFeature() : BaseCrudPermission("studios") { }
}

public class ProjectsPermissions : StudioPermissions { }
