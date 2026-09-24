namespace Automation.Workspace.Features.RepositoryRunners;

public class RepositoryRunnersGroup : Group
{
    public RepositoryRunnersGroup()
    {
        Configure("repository-runners", ep =>
        {
            ep.Description(b => b.ProducesProblemFE(401));
        });
    }
}
