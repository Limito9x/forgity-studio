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
    int VersionNumber
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
    List<TemplateContainerMemberDto> Members,
    List<TemplateConstantDeclarationDto> Constants,
    JsonDocument? PaletteNodesJson = null
);

public static class CloudTemplateClaimHelper
{
    public static Guid GetOwnerUserId(ClaimsPrincipal user)
    {
        var userIdStr =
            user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        return Guid.TryParse(userIdStr, out var parsed) ? parsed : Guid.Empty;
    }

    public static List<TemplateConstantDeclarationDto> ExtractConstants(JsonDocument manifest)
    {
        var result = new List<TemplateConstantDeclarationDto>();
        if (manifest.RootElement.TryGetProperty("constants", out var arr) && arr.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in arr.EnumerateArray())
            {
                var key = item.TryGetProperty("key", out var k) || item.TryGetProperty("Key", out k) ? k.GetString() : null;
                if (string.IsNullOrWhiteSpace(key)) continue;

                var label = item.TryGetProperty("label", out var l) || item.TryGetProperty("Label", out l) ? l.GetString() : key;
                var dataType = item.TryGetProperty("dataType", out var dt) || item.TryGetProperty("DataType", out dt) ? dt.GetString() : "String";
                var scope = item.TryGetProperty("scope", out var sc) || item.TryGetProperty("Scope", out sc) ? sc.GetString() : "General";
                var isRequired = (item.TryGetProperty("isRequired", out var req) || item.TryGetProperty("IsRequired", out req)) && req.ValueKind == JsonValueKind.True;
                var desc = item.TryGetProperty("description", out var d) || item.TryGetProperty("Description", out d) ? d.GetString() : null;

                result.Add(new TemplateConstantDeclarationDto(
                    key,
                    label ?? key,
                    dataType ?? "String",
                    scope ?? "General",
                    isRequired,
                    desc
                ));
            }

        }
        return result;
    }

    public static JsonDocument? ExtractPaletteNodes(JsonDocument manifest)
    {
        if (
            !manifest.RootElement.TryGetProperty("paletteNodes", out var paletteNodes)
            || paletteNodes.ValueKind != JsonValueKind.Array
        )
        {
            return null;
        }

        return JsonDocument.Parse(paletteNodes.GetRawText());
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
