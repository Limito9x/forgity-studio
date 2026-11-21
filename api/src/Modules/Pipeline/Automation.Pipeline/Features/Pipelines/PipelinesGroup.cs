using FastEndpoints;

namespace Automation.Pipeline.Features.Pipelines;

public sealed class PipelinesGroup : Group
{
    public PipelinesGroup()
    {
        Configure("pipelines", ep =>
        {
            ep.Description(x => x.WithTags("Pipelines"));
        });
    }
}
