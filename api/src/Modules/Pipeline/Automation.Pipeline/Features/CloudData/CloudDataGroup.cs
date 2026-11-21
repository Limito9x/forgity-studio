using FastEndpoints;

namespace Automation.Pipeline.Features.CloudData;

public sealed class CloudDataGroup : Group
{
    public CloudDataGroup()
    {
        Configure("/cloud-data", ep =>
        {
            ep.Description(b => b.WithTags("CloudData"));
        });
    }
}
