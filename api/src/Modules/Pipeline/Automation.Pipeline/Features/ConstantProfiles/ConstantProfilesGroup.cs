using FastEndpoints;

namespace Automation.Pipeline.Features.ConstantProfiles;

public sealed class ConstantProfilesGroup : Group
{
    public ConstantProfilesGroup()
    {
        Configure("constant-profiles", ep =>
        {
            ep.Description(x => x.WithTags("ConstantProfiles"));
        });
    }
}
