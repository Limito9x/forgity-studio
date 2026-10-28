using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Contracts.Tools;
using Automation.Repository.Contracts;

namespace Automation.Pipeline.Contracts.StructRegistry.Definitions;

public class WorkstationStructDefinition(IRepositoryApi repositoryApi) : IEntityStructDefinition
{
    public virtual string StructType => WellKnownStructTypes.Workstation;
    public virtual string Label => "Workstation";

    public virtual object? SampleJson => new Dictionary<string, object?>
    {
        ["WorkstationId"] = "00000000-0000-0000-0000-000000000001",
        ["RepositoryId"] = "00000000-0000-0000-0000-000000000002",
        ["RepositoryName"] = "DazAssets",
        ["RunnerId"] = "00000000-0000-0000-0000-000000000003",
        ["RunnerName"] = "LocalWorker",
        ["RootPath"] = "D:/Assets/DazWorkstation",
        ["IsRunnerActive"] = true
    };

    public virtual IReadOnlyList<PinDefinition> OutputPins =>
    [
        new()
        {
            Id = "WorkstationId",
            Label = "Workstation ID",
            PrimitiveType = PinPrimitiveType.EntityRef,
            StructType = WellKnownStructTypes.Workstation,
            Cardinality = PinCardinality.Single
        },
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
        },
        new()
        {
            Id = "RunnerId",
            Label = "Runner ID",
            PrimitiveType = PinPrimitiveType.EntityRef,
            StructType = WellKnownStructTypes.Runner,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "RunnerName",
            Label = "Runner Name",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "RootPath",
            Label = "Root Path",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "IsRunnerActive",
            Label = "Is Runner Active",
            PrimitiveType = PinPrimitiveType.Boolean,
            Cardinality = PinCardinality.Single
        }
    ];

    public virtual async Task<Dictionary<string, object>> ResolveAsync(
        object targetInput,
        ToolExecutionContext context
    )
    {
        var (type, workstationId, isValid) = EntityRefHelper.Parse(targetInput);
        if (!isValid || workstationId == Guid.Empty)
        {
            throw new ArgumentException($"Invalid Target Workstation Reference: '{targetInput}'");
        }

        var ct = context.CancellationToken;
        var result = await repositoryApi.GetWorkstationByIdAsync(workstationId, ct);
        if (result.IsFailed || result.Value == null)
        {
            throw new InvalidOperationException(
                $"Failed to resolve Workstation '{workstationId}': {string.Join(", ", result.Errors.Select(e => e.Message))}"
            );
        }

        var w = result.Value;
        return new Dictionary<string, object>
        {
            ["WorkstationId"] = EntityRefHelper.Create(WellKnownStructTypes.Workstation, w.WorkstationId),
            ["RepositoryId"] = EntityRefHelper.Create(WellKnownStructTypes.Repository, w.RepositoryId),
            ["RepositoryName"] = w.RepositoryName,
            ["RunnerId"] = EntityRefHelper.Create(WellKnownStructTypes.Runner, w.RunnerId),
            ["RunnerName"] = w.RunnerName,
            ["RootPath"] = w.RootPath,
            ["IsRunnerActive"] = w.IsRunnerActive
        };
    }
}

