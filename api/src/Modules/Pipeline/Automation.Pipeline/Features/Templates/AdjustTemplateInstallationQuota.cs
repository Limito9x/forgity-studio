using FastEndpoints;

namespace Automation.Pipeline.Features.Templates;

public record AdjustTemplateInstallationQuotaRequest(
    QuotaAdjustmentAction Action,
    int? Amount = null
);

public class AdjustTemplateInstallationQuotaEndpoint(ITemplateQuotaService quotaService)
    : Endpoint<AdjustTemplateInstallationQuotaRequest, TemplateInstallationQuotaDto>
{
    public override void Configure()
    {
        Patch("installations/{libraryItemId:guid}/quota");
        Group<TemplatesGroup>();
        Description(b => b.WithSummary("Admin/Billing: adjust quota limit, add credits, reset usage, or revoke access"));
    }

    public override async Task HandleAsync(
        AdjustTemplateInstallationQuotaRequest req,
        CancellationToken ct
    )
    {
        var libraryItemId = Route<Guid>("libraryItemId");
        var result = await quotaService.AdjustQuotaAsync(
            new AdjustTemplateQuotaCommand(libraryItemId, req.Action, req.Amount),
            ct
        );

        if (result.IsFailed)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        await Send.OkAsync(result.Value, ct);
    }
}
