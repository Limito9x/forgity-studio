using FastEndpoints;

namespace Automation.SystemModule.Features.Studios;

public sealed class SystemStudiosGroup : Group
{
    public SystemStudiosGroup()
    {
        Configure("/system/studios", ep =>
        {
            ep.Description(b => b.WithTags("System Studios"));
        });
    }
}

