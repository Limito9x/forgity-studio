namespace Automation.Pipeline.BuildTime.Features.Authoring;

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
