using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Tools.Attributes;
using Automation.Tag.Contracts;
using Automation.Repository.Contracts;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Tools.Tags;

public class AssignTagInputs
{
    [ToolPin(
        Id = "Target",
        Label = "Target Entity",
        PrimitiveType = PinPrimitiveType.EntityRef,
        Cardinality = PinCardinality.Single,
        IsRequired = true,
        Metadata = """{"type": "entity-select", "properties": {"entity": "Resource"}}"""
    )]
    public object? Target { get; set; }

    [ToolPin(
        Id = "TagPath",
        Label = "Tag Path",
        PrimitiveType = PinPrimitiveType.String,
        Cardinality = PinCardinality.Single,
        IsRequired = true,
        DefaultValue = "Asset"
    )]
    public string TagPath { get; set; } = "Asset";

    [ToolPin(
        Id = "SubPath",
        Label = "Sub Path",
        PrimitiveType = PinPrimitiveType.String,
        Cardinality = PinCardinality.Single,
        IsRequired = false
    )]
    public string? SubPath { get; set; }
}

public class AssignTagOutputs
{
    [ToolPin(
        Id = "Success",
        Label = "Success",
        PrimitiveType = PinPrimitiveType.Boolean,
        Cardinality = PinCardinality.Single,
        IsRequired = true
    )]
    public bool Success { get; set; }

    [ToolPin(
        Id = "AssignedTag",
        Label = "Assigned Tag",
        PrimitiveType = PinPrimitiveType.String,
        Cardinality = PinCardinality.Single,
        IsRequired = true
    )]
    public string AssignedTag { get; set; } = string.Empty;
}

public class AssignTagTool(
    ITagApi tagApi,
    IRepositoryApi workspaceApi,
    ILogger<AssignTagTool> logger
) : BaseResolverTool<AssignTagInputs, AssignTagOutputs>
{
    public override string Key => "AssignTag";
    public override IReadOnlyList<string> Aliases => ["AddTag", "TagEntity"];
    public override string Label => "Assign Tag";
    public override string? Category => "Tag & Metadata";
    public override string? Description => "Assigns a tag (or semantic sub-path tag) to a Resource.";
    public override bool IsPure => false;

    protected override async Task<AssignTagOutputs> ExecuteCoreAsync(
        AssignTagInputs input,
        ToolExecutionContext context
    )
    {
        var ct = context.CancellationToken;

        var targetGuid = EntityRefHelper.ExtractRefId(input.Target);
        if (targetGuid == null)
            throw new ArgumentException($"Invalid Target EntityRef/GUID format: '{input.Target}'");

        var tagPath = input.TagPath?.Trim();
        if (string.IsNullOrWhiteSpace(tagPath))
            throw new ArgumentException("TagPath cannot be empty.");

        var projectId = context.ProjectId;

        // Resolve target entity to ResourceId
        var targetResourceId = targetGuid.Value;
        var locResult = await workspaceApi.GetResourceLocationAsync(targetGuid.Value, ct);
        if (locResult.IsSuccess && locResult.Value != null && locResult.Value.ResourceId != Guid.Empty)
        {
            targetResourceId = locResult.Value.ResourceId;
        }

        var result = await tagApi.AssignTagAsync(
            projectId,
            "Resource",
            targetResourceId,
            tagPath,
            string.IsNullOrWhiteSpace(input.SubPath) ? null : input.SubPath.Trim(),
            ct: ct
        );

        if (result.IsFailed)
        {
            logger.LogWarning(
                "Failed to assign tag '{TagPath}' to Resource {EntityId}: {Errors}",
                tagPath,
                targetResourceId,
                string.Join(", ", result.Errors.Select(e => e.Message))
            );

            return new AssignTagOutputs
            {
                Success = false,
                AssignedTag = string.Empty
            };
        }

        return new AssignTagOutputs
        {
            Success = true,
            AssignedTag = tagPath
        };
    }
}
