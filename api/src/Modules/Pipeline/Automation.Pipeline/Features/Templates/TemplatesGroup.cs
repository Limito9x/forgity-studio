using FastEndpoints;

namespace Automation.Pipeline.Features.Templates;

public sealed class TemplatesGroup : Group
{
    public TemplatesGroup()
    {
        Configure("templates", ep =>
        {
            ep.Description(x => x.WithTags("Templates"));
        });
    }
}
