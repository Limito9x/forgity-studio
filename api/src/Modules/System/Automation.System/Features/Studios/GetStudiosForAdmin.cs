using Automation.SharedKernel.Extensions.Results;
using Automation.Studio.Contracts;
using Automation.SystemModule.Constants;
using FastEndpoints;

namespace Automation.SystemModule.Features.Studios;

public class GetStudiosForAdmin(IStudioApi studioApi)
    : EndpointWithoutRequest<IReadOnlyList<StudioAdminSummaryDto>>
{
    public override void Configure()
    {
        Get("");
        Group<SystemStudiosGroup>();
        Permissions(SystemPermissions.Studios.GetAll);
        Description(b =>
            b.Produces<IReadOnlyList<StudioAdminSummaryDto>>(200)
                .WithSummary("List all studios for Platform Admin")
                .WithDescription(
                    "Returns a summary of all registered studios, current plan tiers, execution credits and storage usage."
                )
        );
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var result = await studioApi.GetAllStudiosForAdminAsync(ct);
        await this.SendResultAsync(result, ct);
    }
}
