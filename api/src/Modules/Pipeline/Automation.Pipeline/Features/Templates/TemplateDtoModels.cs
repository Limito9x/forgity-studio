using System.Security.Claims;
using System.Text.Json;
using Automation.Pipeline.Domain.Entities;

namespace Automation.Pipeline.Features.Templates;

public record CloudTemplateSummaryDto(
    Guid TemplatePackageId,
    Guid? PrimaryMasterVersionId,
    string Title,
    string? Description,
    string Category,
    string QuotaStrategy,
    int? DefaultQuotaLimit,
    int? RemainingRuns,
    int UsedRuns,
    bool IsAddedToLibrary,
    Guid? LibraryItemId,
    JsonDocument? ContractsJson,
    JsonDocument? RootPipelineJson,
    JsonDocument ContainerManifestJson
);

public record TemplateLibraryItemDto(
    Guid Id,
    Guid TemplatePackageId,
    Guid? PrimaryMasterVersionId,
    string Title,
    string? Description,
    string Category,
    string QuotaStrategy,
    Guid? ConstantProfileId,
    string? ConstantProfileName,
    int UsedRuns,
    int? MaxRuns,
    int? RemainingRuns,
    DateTimeOffset AddedAt,
    JsonDocument? ContractsJson,
    JsonDocument? RootPipelineJson,
    JsonDocument ContainerManifestJson
);

public static class CloudTemplateClaimHelper
{
    public static Guid GetOwnerUserId(ClaimsPrincipal user)
    {
        var userIdStr =
            user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        return Guid.TryParse(userIdStr, out var parsed) ? parsed : Guid.Empty;
    }

    public static JsonDocument? ExtractRootPipeline(PipelineVersion? version)
    {
        if (
            version?.DagBundleJson is not null
            && version.DagBundleJson.RootElement.TryGetProperty("rootPipeline", out var rp)
        )
        {
            return JsonDocument.Parse(rp.GetRawText());
        }
        return null;
    }
}
