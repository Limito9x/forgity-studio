namespace Automation.Workspace.Features.Repositories;

public class RepositoriesGroup : Group
{
    public RepositoriesGroup()
    {
        Configure("repositories", ep =>
        {
            ep.Description(b => b.ProducesProblemFE(401));
        });
    }
}
