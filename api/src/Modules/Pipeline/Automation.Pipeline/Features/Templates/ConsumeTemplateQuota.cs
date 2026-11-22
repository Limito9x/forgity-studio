using Automation.Pipeline.Infrastructure.Persistence;
using FastEndpoints;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.Templates;

public record ConsumeTemplateQuotaRequest(
    Guid TemplatePackageId,
    string MachineKey,
    int Count = 1,
    Guid? LibraryItemId = null
);

public class ConsumeTemplateQuotaEndpoint(PipelineDbContext db)
    : Endpoint<ConsumeTemplateQuotaRequest>
{
    public override void Configure()
    {
        Post("consume-quota");
        Group<TemplatesGroup>();
        Description(b => b.WithSummary("Consume run quota for an execution on a workstation"));
    }

    public override async Task HandleAsync(ConsumeTemplateQuotaRequest req, CancellationToken ct)
    {
        var existing = req.LibraryItemId.HasValue
            ? await db.TemplateLibraryItems.FirstOrDefaultAsync(
                x => x.Id == req.LibraryItemId.Value,
                ct
            )
            : await db.TemplateLibraryItems.FirstOrDefaultAsync(
                q =>
                    q.TemplatePackageId == req.TemplatePackageId
                    && q.MachineKey == req.MachineKey
                    && q.PeriodKey == "lifetime",
                ct
            );

        if (existing is null)
        {
            HttpContext.Response.StatusCode = 403;
            await HttpResponseJsonExtensions.WriteAsJsonAsync(
                HttpContext.Response,
                new
                {
                    error = "TEMPLATE_NOT_IN_LIBRARY",
                    message = "Template is not in My Library.",
                },
                ct
            );
            return;
        }

        if (existing.IsRevoked)
        {
            HttpContext.Response.StatusCode = 403;
            await HttpResponseJsonExtensions.WriteAsJsonAsync(
                HttpContext.Response,
                new
                {
                    error = "TEMPLATE_ACCESS_REVOKED",
                    message = "Template access has been revoked for this workstation.",
                },
                ct
            );
            return;
        }

        var ownerUserId = CloudTemplateClaimHelper.GetOwnerUserId(User);
        var ownerEmail = CloudTemplateClaimHelper.GetOwnerEmail(User);
        var resolvedUserId = ownerUserId != Guid.Empty ? (Guid?)ownerUserId : existing.OwnerUserId;
        var resolvedEmail = !string.IsNullOrWhiteSpace(ownerEmail) ? ownerEmail : existing.OwnerEmail;

        if (!existing.MaxRuns.HasValue)
        {
            await db.Database.ExecuteSqlInterpolatedAsync(
                $@"
                UPDATE pipeline.""TemplateLibraryItems""
                SET ""UsedRuns"" = ""UsedRuns"" + {req.Count},
                    ""LastRunAt"" = NOW(),
                    ""OwnerUserId"" = {resolvedUserId},
                    ""OwnerEmail"" = {resolvedEmail}
                WHERE ""Id"" = {existing.Id} AND ""IsRevoked"" = FALSE
            ",
                ct
            );
            await Send.OkAsync(new { allowed = true, remaining = (int?)null }, ct);
            return;
        }

        var rows = await db.Database.ExecuteSqlInterpolatedAsync(
            $@"
            UPDATE pipeline.""TemplateLibraryItems""
            SET ""UsedRuns"" = ""UsedRuns"" + {req.Count},
                ""LastRunAt"" = NOW(),
                ""OwnerUserId"" = {resolvedUserId},
                ""OwnerEmail"" = {resolvedEmail}
            WHERE ""Id"" = {existing.Id} AND ""IsRevoked"" = FALSE AND ""UsedRuns"" + {req.Count} <= ""MaxRuns""
        ",
            ct
        );

        if (rows == 0)
        {
            HttpContext.Response.StatusCode = 402;
            await HttpResponseJsonExtensions.WriteAsJsonAsync(
                HttpContext.Response,
                new { error = "QUOTA_EXHAUSTED", message = "Template quota exhausted." },
                ct
            );
            return;
        }

        await db.Entry(existing).ReloadAsync(ct);
        await Send.OkAsync(
            new
            {
                allowed = true,
                remaining = Math.Max(0, existing.MaxRuns.Value - existing.UsedRuns),
            },
            ct
        );
    }
}
