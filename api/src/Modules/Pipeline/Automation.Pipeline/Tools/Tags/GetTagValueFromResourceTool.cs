using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Tools.Attributes;
using Automation.Repository.Contracts;
using Automation.Repository.Contracts.Extensions;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Tools.Tags;

public class GetTagValueFromResourceInputs
{
    [ToolPin(
        Id = "Target",
        Label = "Resource",
        PrimitiveType = PinPrimitiveType.EntityRef,
        Cardinality = PinCardinality.Single,
        IsRequired = true,
        Metadata = """{"type": "entity-select", "properties": {"entity": "Resource"}}"""
    )]
    public object? Target { get; set; }

    [ToolPin(
        Id = "TagId",
        Label = "Tag",
        PrimitiveType = PinPrimitiveType.EntityRef,
        Cardinality = PinCardinality.Single,
        IsRequired = true,
        Metadata = """{"type": "entity-select", "properties": {"entity": "Tag"}}"""
    )]
    public object? TagId { get; set; }
}

public class GetTagValueFromResourceOutputs
{
    [ToolPin(
        Id = "TagValues",
        Label = "Tag Values",
        PrimitiveType = PinPrimitiveType.String,
        Cardinality = PinCardinality.Array,
        IsRequired = true
    )]
    public List<string> TagValues { get; set; } = [];

    [ToolPin(
        Id = "FirstValue",
        Label = "First Value",
        PrimitiveType = PinPrimitiveType.String,
        Cardinality = PinCardinality.Single,
        IsRequired = false
    )]
    public string FirstValue { get; set; } = string.Empty;

    [ToolPin(
        Id = "HasTag",
        Label = "Has Tag",
        PrimitiveType = PinPrimitiveType.Boolean,
        Cardinality = PinCardinality.Single,
        IsRequired = true
    )]
    public bool HasTag { get; set; }
}

public class GetTagValueFromResourceTool(
    IRepositoryApi workspaceApi,
    ILogger<GetTagValueFromResourceTool> logger
) : BaseResolverTool<GetTagValueFromResourceInputs, GetTagValueFromResourceOutputs>
{
    public override string Key => "GetTagValueFromResource";
    public override IReadOnlyList<string> Aliases => ["GetTagValueFromInspection"];
    public override string Label => "Get Tag Value from Resource";
    public override string? Category => "Tag & Metadata";
    public override string? Description => "Extracts values from Resource metadata that correspond to a specified Tag.";
    public override bool IsPure => true;

    protected override async Task<GetTagValueFromResourceOutputs> ExecuteCoreAsync(
        GetTagValueFromResourceInputs input,
        ToolExecutionContext context
    )
    {
        var ct = context.CancellationToken;

        var targetGuid = EntityRefHelper.ExtractRefId(input.Target);
        if (targetGuid == null)
            throw new ArgumentException($"Invalid Target EntityRef/GUID format: '{input.Target}'");

        var tagObj = input.TagId;
        if (tagObj == null || string.IsNullOrWhiteSpace(tagObj.ToString()))
            throw new ArgumentException("Tag is required (provide Tag ID, EntityRef, or Tag Path like 'Mesh.Body').");

        var tGuid = targetGuid.Value;
        var tagValues = new List<string>();

        // Query Resource metadata with TagMap from RepositoryApi
        var metaResult = await workspaceApi.GetMetadataDetailWithTagsAsync(tGuid, ct);
        if (metaResult.IsSuccess && metaResult.Value != null)
        {
            var rawValues = metaResult.Value.GetAllValuesByTag(tagObj);
            tagValues.AddRange(
                rawValues
                    .Select(v => v?.ToString() ?? string.Empty)
                    .Where(s => !string.IsNullOrEmpty(s))
            );
        }

        var hasTag = tagValues.Count > 0;
        var firstValue = tagValues.FirstOrDefault() ?? string.Empty;

        logger.LogInformation(
            "GetTagValueFromResource resolved for Resource '{ResourceId}', Tag '{Tag}': {Count} values [{Values}]",
            tGuid,
            tagObj,
            tagValues.Count,
            string.Join(", ", tagValues)
        );

        return new GetTagValueFromResourceOutputs
        {
            TagValues = tagValues,
            FirstValue = firstValue,
            HasTag = hasTag
        };
    }
}
