using Automation.Content.Contracts;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Repository.Contracts;

namespace Automation.Pipeline.Tools.Workspaces;

/// <summary>
/// Tool lấy thông tin Content được liên kết với Resource (Pure Data Tool).
/// Nếu Resource chưa gán Content, tự động fallback ContentName về BaseName của file.
/// </summary>
public class GetResourceContentTool(
    IRepositoryApi workspaceApi,
    IContentApi contentApi
) : IResolverTool
{
    public string Key => "GetResourceContent";
    public string Label => "Get Resource Content";
    public string? Category => "Workspace";
    public bool IsPure => true;

    public IReadOnlyList<PinDefinition> Inputs =>
    [
        new()
        {
            Id = "Resource",
            Label = "Resource",
            PrimitiveType = PinPrimitiveType.EntityRef,
            EntityTarget = "resource",
            Cardinality = PinCardinality.Single,
            IsRequired = true,
            Metadata = """{"type": "entity-select", "properties": {"entity": "Resource"}}"""
        }
    ];

    public IReadOnlyList<PinDefinition> Outputs =>
    [
        new()
        {
            Id = "ContentId",
            Label = "Content ID",
            PrimitiveType = PinPrimitiveType.EntityRef,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "ContentName",
            Label = "Content Name",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "ContentType",
            Label = "Content Type",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "HasContent",
            Label = "Has Content",
            PrimitiveType = PinPrimitiveType.Boolean,
            Cardinality = PinCardinality.Single
        }
    ];

    public async Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        var targetObj = inputs.GetValueOrDefault("Resource") ??
                        inputs.GetValueOrDefault("resource") ??
                        inputs.GetValueOrDefault("Target") ??
                        inputs.Values.FirstOrDefault();

        var (type, targetId, isValid) = EntityRefHelper.Parse(targetObj);
        if (!isValid || targetId == Guid.Empty)
        {
            throw new ArgumentException($"Invalid Target Resource Reference: '{targetObj}'");
        }

        var ct = context.CancellationToken;

        // 1. Resolve resource location info
        var singleResult = await workspaceApi.GetResourceLocationAsync(targetId, ct);
        ResourceLocationInfoDto? locationInfo = null;

        if (singleResult.IsSuccess)
        {
            locationInfo = singleResult.Value;
        }
        else
        {
            var listResult = await workspaceApi.GetResourceLocationsAsync([targetId], context.AgentId, ct);
            if (listResult.IsSuccess && listResult.Value.TryGetValue(targetId.ToString(), out var loc))
            {
                locationInfo = loc;
            }
        }

        var baseName = !string.IsNullOrEmpty(locationInfo?.RelativePath)
            ? Path.GetFileNameWithoutExtension(locationInfo.RelativePath)
            : string.Empty;

        var contentId = locationInfo?.ContentId;
        var contentName = baseName;
        var contentType = string.Empty;
        var hasContent = false;

        if (contentId.HasValue && contentId.Value != Guid.Empty)
        {
            var contentResult = await contentApi.GetContentByIdAsync(contentId.Value, ct);
            if (contentResult.IsSuccess && contentResult.Value != null)
            {
                contentName = contentResult.Value.Name;
                contentType = contentResult.Value.ContentTypeName ?? string.Empty;
                hasContent = true;
            }
        }

        return new Dictionary<string, object>
        {
            ["ContentId"] = contentId.HasValue ? contentId.Value.ToString() : string.Empty,
            ["ContentName"] = contentName,
            ["ContentType"] = contentType,
            ["HasContent"] = hasContent
        };
    }
}
