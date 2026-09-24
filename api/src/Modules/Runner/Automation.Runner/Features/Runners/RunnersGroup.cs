namespace Automation.Runner.Features.Runners;

public class RunnersGroup : Group
{
    public RunnersGroup()
    {
        Configure("runners", ep =>
        {
            ep.Description(x => x.WithTags("Runners"));
        });
    }
}
