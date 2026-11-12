using Automation.SharedKernel.Extensions.Results;
using Automation.Studio.Contracts;
using Automation.SystemModule.Constants;
using FastEndpoints;

namespace Automation.SystemModule.Features.Studios;

public record UpdateStudioQuotaRequest(
    Guid Id,
    StudioPlanTier? PlanTier = null,
    int? ExecutionCreditsRemaining = null,
    long? StudioManagedStorageQuotaBytes = null
);

public class UpdateStudioQuotaForAdmin(IStudioApi studioApi)
    : Endpoint<UpdateStudioQuotaRequest>
{
    public override void Configure()
    {
        Patch("{id}/quota");
        Group<SystemStudiosGroup>();
        Permissions(SystemPermissions.Studios.UpdateQuota);
        Description(b => b
            .Produces(200)
            .ProducesProblem(400)
            .ProducesProblem(404)
            .WithSummary("Update studio quota and plan tier")
            .WithDescription("Allows platform administrators to grant execution credits, adjust cloud storage quota or upgrade/downgrade plan tiers.")
        );
    }

    public override async Task HandleAsync(UpdateStudioQuotaRequest req, CancellationToken ct)
    {
        var dto = new AdminUpdateStudioQuotaDto(
            req.PlanTier,
            req.ExecutionCreditsRemaining,
            req.StudioManagedStorageQuotaBytes
        );

        var result = await studioApi.AdminUpdateStudioQuotaAsync(req.Id, dto, ct);
        await this.SendResultAsync(result, ct);
    }
}

