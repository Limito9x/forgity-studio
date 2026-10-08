using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Tools;

namespace Automation.Pipeline.Domain.ValueObjects;

public static class FlowPinHelper
{
    public static readonly PinDefinition ExecInPin = new()
    {
        Id = "exec_in",
        Label = "Exec",
        Kind = PinKind.Exec,
        PrimitiveType = PinPrimitiveType.String,
        Cardinality = PinCardinality.Single,
        IsRequired = false
    };

    public static readonly PinDefinition ExecOutPin = new()
    {
        Id = "exec_out",
        Label = "Exec",
        Kind = PinKind.Exec,
        PrimitiveType = PinPrimitiveType.String,
        Cardinality = PinCardinality.Single,
        IsRequired = false
    };

    public static (IReadOnlyList<PinDefinition> Inputs, IReadOnlyList<PinDefinition> Outputs) WithExecPins(
        IResolverTool tool
    ) => WithExecPins(PipelineNodeKind.Tool, tool.IsPure, tool.Inputs, tool.Outputs);

    public static (IReadOnlyList<PinDefinition> Inputs, IReadOnlyList<PinDefinition> Outputs) WithExecPinsResolved(
        IResolverTool tool,
        Dictionary<string, object?>? configValues = null,
        IPinResolutionContext? context = null
    )
    {
        var (inputs, outputs) = tool.ResolvePins(configValues, context);
        return WithExecPins(PipelineNodeKind.Tool, tool.IsPure, inputs, outputs);
    }

    public static (IReadOnlyList<PinDefinition> Inputs, IReadOnlyList<PinDefinition> Outputs) WithExecPins(
        NodeDefinition customNode
    ) => WithExecPins(PipelineNodeKind.Custom, isPure: false, customNode.Inputs, customNode.Outputs);

    public static (IReadOnlyList<PinDefinition> Inputs, IReadOnlyList<PinDefinition> Outputs) WithExecPins(
        PipelineNodeKind nodeKind,
        bool isPure,
        IReadOnlyList<PinDefinition> inputs,
        IReadOnlyList<PinDefinition> outputs
    )
    {
        if (isPure) return (inputs, outputs);

        if (nodeKind == PipelineNodeKind.Start)
        {
            var newStartOutputs = new List<PinDefinition>();
            if (!outputs.Any(p => p.Kind == PinKind.Exec || p.Id == "exec_out"))
            {
                newStartOutputs.Add(ExecOutPin);
            }
            newStartOutputs.AddRange(outputs);
            return (inputs, newStartOutputs);
        }

        if (nodeKind == PipelineNodeKind.Return)
        {
            var newReturnInputs = new List<PinDefinition>();
            if (!inputs.Any(p => p.Kind == PinKind.Exec || p.Id == "exec_in"))
            {
                newReturnInputs.Add(ExecInPin);
            }
            newReturnInputs.AddRange(inputs);
            return (newReturnInputs, outputs);
        }

        var resultInputs = new List<PinDefinition>();
        if (!inputs.Any(p => p.Kind == PinKind.Exec || p.Id == "exec_in"))
        {
            resultInputs.Add(ExecInPin);
        }
        resultInputs.AddRange(inputs);

        var resultOutputs = new List<PinDefinition>();
        if (!outputs.Any(p => p.Kind == PinKind.Exec || p.Id == "exec_out"))
        {
            resultOutputs.Add(ExecOutPin);
        }
        resultOutputs.AddRange(outputs);

        return (resultInputs, resultOutputs);
    }

    public static (IReadOnlyList<PinDefinition> Inputs, IReadOnlyList<PinDefinition> Outputs) WithExecPins(
        string nodeKind,
        bool isPure,
        IReadOnlyList<PinDefinition> inputs,
        IReadOnlyList<PinDefinition> outputs
    ) => WithExecPins(Enum.TryParse<PipelineNodeKind>(nodeKind, true, out var k) ? k : PipelineNodeKind.Custom, isPure, inputs, outputs);
}
