using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Contracts.Tools;
using Automation.Repository.Contracts;
namespace Automation.Pipeline.Contracts.StructRegistry.Definitions;

public class RepositoryStructDefinition(IRepositoryApi repositoryApi) : IEntityStructDefinition
{
    public virtual string StructType => WellKnownStructTypes.Repository;
    public virtual string Label => "Repository";

    public virtual object? SampleJson => new Dictionary<string, object?>
    {
        ["RepositoryId"] = "00000000-0000-0000-0000-000000000001",
        ["RepositoryName"] = "MainAssetsRepository"
    };

    public virtual IReadOnlyList<PinDefinition> OutputPins =>
    [
        new()
        {
            Id = "RepositoryId",
            Label = "Repository ID",
            PrimitiveType = PinPrimitiveType.EntityRef,
            StructType = WellKnownStructTypes.Repository,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "RepositoryName",
            Label = "Repository Name",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        }
    ];

    public virtual async Task<Dictionary<string, object>> ResolveAsync(
        object targetInput,
        ToolExecutionContext context
    )
    {
        var (type, repoId, isValid) = EntityRefHelper.Parse(targetInput);
        if (!isValid || repoId == Guid.Empty)
        {
            throw new ArgumentException($"Invalid Target Repository Reference: '{targetInput}'");
        }

        var ct = context.CancellationToken;

        var namesResult = await repositoryApi.GetRepositoryNamesAsync([repoId], ct);
        var repoName = namesResult.IsSuccess && namesResult.Value.TryGetValue(repoId, out var name)
            ? name
            : repoId.ToString();

        return new Dictionary<string, object>
        {
            ["RepositoryId"] = repoId,
            ["RepositoryName"] = repoName
        };
    }
}
