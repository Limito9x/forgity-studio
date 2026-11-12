using Automation.SharedKernel.Extensions.Results;
using Automation.Studio.Contracts;
using FastEndpoints;
using FluentResults;

namespace Automation.Studio.Features.Studios;

public record VerifyExecutionRequest(string Slug);
public record VerifyExecutionResponse(
    Guid StudioId,
    bool Allowed,
    int CreditsRemaining,
    StudioPlanTier PlanTier
);

public class VerifyExecutionEndpoint(IStudioApi studioApi)
    : Endpoint<VerifyExecutionRequest, VerifyExecutionResponse>
{
    public override void Configure()
    {
        Post("/{slug}/pipelines/verify-run");
        Group<StudiosGroup>();
        Description(b => b
            .Produces<VerifyExecutionResponse>(200)
            .ProducesProblem(402)
            .ProducesProblem(404)
            .WithSummary("Verify Pipeline Execution Quota")
            .WithDescription("Checks whether the studio has remaining execution credits before triggering a DAG run.")
        );
    }

    public override async Task HandleAsync(VerifyExecutionRequest req, CancellationToken ct)
    {
        var quotaResult = await studioApi.GetStudioQuotaBySlugAsync(req.Slug, ct);
        if (quotaResult.IsFailed)
        {
            await this.SendResultAsync(quotaResult, ct);
            return;
        }

        var quota = quotaResult.Value;
        if (quota.ExecutionCreditsRemaining <= 0)
        {
            HttpContext.Response.StatusCode = 402; // Payment Required
            await HttpResponseJsonExtensions.WriteAsJsonAsync(
                HttpContext.Response,
                new
                {
                    error = "QUOTA_EXHAUSTED",
                    message = "Your execution credits have been exhausted. Please upgrade to Indie Pro to continue running pipelines.",
                    studioId = quota.StudioId,
                    creditsRemaining = quota.ExecutionCreditsRemaining,
                    planTier = quota.PlanTier.ToString()
                },
                cancellationToken: ct
            );
            return;
        }

        var response = Result.Ok(new VerifyExecutionResponse(
            quota.StudioId,
            true,
            quota.ExecutionCreditsRemaining,
            quota.PlanTier
        ));
        await this.SendResultAsync(response, ct);
    }
}

public record CompleteExecutionRequest(string Slug, int Amount = 1);

public class CompleteExecutionEndpoint(IStudioApi studioApi)
    : Endpoint<CompleteExecutionRequest>
{
    public override void Configure()
    {
        Post("/{slug}/pipelines/complete-run");
        Group<StudiosGroup>();
        Description(b => b
            .Produces(200)
            .ProducesProblem(400)
            .ProducesProblem(404)
            .WithSummary("Deduct Execution Credits")
            .WithDescription("Deducts execution credits from the studio after a pipeline DAG completes.")
        );
    }

    public override async Task HandleAsync(CompleteExecutionRequest req, CancellationToken ct)
    {
        var quotaResult = await studioApi.GetStudioQuotaBySlugAsync(req.Slug, ct);
        if (quotaResult.IsFailed)
        {
            await this.SendResultAsync(quotaResult, ct);
            return;
        }

        var deductResult = await studioApi.ConsumeExecutionCreditAsync(quotaResult.Value.StudioId, req.Amount, ct);
        await this.SendResultAsync(deductResult, ct);
    }
}

