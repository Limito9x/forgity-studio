using FastEndpoints;

namespace Automation.Studio.Features.Projects;

public sealed class ProjectsGroup : Group
{
    public ProjectsGroup()
    {
        Configure("/projects", ep =>
        {
            ep.Description(b => b.WithTags("Projects"));
        });
    }
}

