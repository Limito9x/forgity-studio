namespace Automation.Repository.Features.ResourceVersions;

public class ResourceVersionsGroup : Group
{
    public ResourceVersionsGroup()
    {
        Configure("resource-versions", ep =>
        {
            ep.Description(x => x
                .Produces(StatusCodes.Status401Unauthorized)
                .Produces(StatusCodes.Status403Forbidden)
                .WithTags("ResourceVersions"));
        });
    }
}

