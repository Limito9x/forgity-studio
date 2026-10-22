using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Tools;
using Automation.Runner.Contracts;

namespace Automation.Pipeline.Engine.StructRegistry.Definitions;

public class RunnerStructDefinition(IRunnerApi runnerApi) : IEntityStructDefinition
{
    public string StructType => WellKnownStructTypes.Runner;
    public string Label => "Runner";

    public IReadOnlyList<PinDefinition> OutputPins =>
    [
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
            Id = "MachineKey",
            Label = "Machine Key",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "OsPlatform",
            Label = "OS Platform",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "CpuModel",
            Label = "CPU Model",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        }
    ];

    public object? SampleJson => new Dictionary<string, object?>
    {
        ["RunnerId"] = "00000000-0000-0000-0000-000000000001",
        ["RunnerName"] = "Studio-Workstation-01",
        ["MachineKey"] = "DESKTOP-BLENDER-RIG",
        ["OsPlatform"] = "Windows",
        ["CpuModel"] = "AMD Ryzen 9 5900X"
    };

    public async Task<Dictionary<string, object>> ResolveAsync(
        object targetInput,
        ToolExecutionContext context
    )
    {
        var (type, runnerId, isValid) = EntityRefHelper.Parse(targetInput);
        if (!isValid || runnerId == Guid.Empty)
        {
            throw new ArgumentException($"Invalid Target Runner Reference: '{targetInput}'");
        }

        var ct = context.CancellationToken;
        var runnerResult = await runnerApi.GetRunnerByIdAsync(runnerId, ct);
        if (runnerResult.IsFailed || runnerResult.Value == null)
        {
            return new Dictionary<string, object>
            {
                ["RunnerId"] = runnerId,
                ["RunnerName"] = runnerId.ToString(),
                ["MachineKey"] = string.Empty,
                ["OsPlatform"] = "Unknown",
                ["CpuModel"] = string.Empty
            };
        }

        var r = runnerResult.Value;
        return new Dictionary<string, object>
        {
            ["RunnerId"] = r.Id,
            ["RunnerName"] = r.Name ?? r.Id.ToString(),
            ["MachineKey"] = r.MachineKey ?? string.Empty,
            ["OsPlatform"] = r.OsPlatform ?? "Unknown",
            ["CpuModel"] = r.CpuModel ?? string.Empty
        };
    }
}
