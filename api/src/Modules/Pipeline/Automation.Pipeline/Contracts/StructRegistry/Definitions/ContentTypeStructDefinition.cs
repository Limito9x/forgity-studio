using Automation.Content.Contracts;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Contracts.Tools;
namespace Automation.Pipeline.Contracts.StructRegistry.Definitions;

public class ContentTypeStructDefinition(IContentApi contentApi) : IEntityStructDefinition
{
    public string StructType => WellKnownStructTypes.ContentType;
    public string Label => "Content Type";

    public IReadOnlyList<PinDefinition> OutputPins =>
    [
        new()
        {
            Id = "ContentId",
            Label = "Content ID",
            PrimitiveType = PinPrimitiveType.EntityRef,
            StructType = WellKnownStructTypes.ContentType,
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
            Id = "ContentTypeColor",
            Label = "Content Type Color",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        }
    ];

    public object? SampleJson => new Dictionary<string, object?>
    {
        ["ContentId"] = "00000000-0000-0000-0000-000000000001",
        ["ContentName"] = "HeroCharacter",
        ["ContentType"] = "Character",
        ["ContentTypeColor"] = "#3B82F6"
    };

    public async Task<Dictionary<string, object>> ResolveAsync(
        object targetInput,
        ToolExecutionContext context
    )
    {
        var (type, contentId, isValid) = EntityRefHelper.Parse(targetInput);
        if (!isValid || contentId == Guid.Empty)
        {
            throw new ArgumentException($"Invalid Target Content Reference: '{targetInput}'");
        }

        var ct = context.CancellationToken;
        var contentResult = await contentApi.GetContentByIdAsync(contentId, ct);
        if (contentResult.IsFailed || contentResult.Value == null)
        {
            return new Dictionary<string, object>
            {
                ["ContentId"] = contentId,
                ["ContentName"] = contentId.ToString(),
                ["ContentType"] = string.Empty,
                ["ContentTypeColor"] = string.Empty
            };
        }

        var c = contentResult.Value;
        return new Dictionary<string, object>
        {
            ["ContentId"] = c.Id,
            ["ContentName"] = c.Name ?? c.Id.ToString(),
            ["ContentType"] = c.ContentTypeName ?? string.Empty,
            ["ContentTypeColor"] = c.ContentTypeColor ?? string.Empty
        };
    }
}
