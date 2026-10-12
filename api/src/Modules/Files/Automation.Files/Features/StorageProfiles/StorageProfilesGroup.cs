using FastEndpoints;
using Microsoft.AspNetCore.Http;

namespace Automation.Files.Features.StorageProfiles;

public sealed class StorageProfilesGroup : Group
{
    public StorageProfilesGroup()
    {
        Configure("storage-profiles", ep =>
        {
            ep.Description(x => x.WithTags("StorageProfiles"));
        });
    }
}
