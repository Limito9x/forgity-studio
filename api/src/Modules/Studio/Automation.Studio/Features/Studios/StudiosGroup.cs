using FastEndpoints;

namespace Automation.Studio.Features.Studios;

public sealed class StudiosGroup : Group
{
    public StudiosGroup()
    {
        Configure("/studios", ep =>
        {
            ep.Description(b => b.WithTags("Studios"));
        });
    }
}
