namespace Automation.Repository.Features.Resources;

public class ResourcesGroup : Group
{
    public ResourcesGroup()
    {
        Configure(
            "resources",
            ep =>
            {
                ep.Description(x =>
                    x.Produces(StatusCodes.Status401Unauthorized)
                        .Produces(StatusCodes.Status403Forbidden)
                        .WithTags("Resources")
                );
            }
        );
    }
}
