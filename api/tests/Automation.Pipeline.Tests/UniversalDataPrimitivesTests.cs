using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Contracts.StructRegistry;
using Automation.Pipeline.Contracts.StructRegistry.Definitions;
using Automation.Pipeline.Contracts.Tools;
using Automation.Pipeline.Runtime.DataResolver;
using Automation.Pipeline.Hubs;
using Automation.Pipeline.Contracts.Tools.Variables;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace Automation.Pipeline.Tests;

public class UniversalDataPrimitivesTests
{
    private static (EntityStructRegistry registry, Guid projectId) CreateTestRegistryWithSlotBinding()
    {
        var registry = new EntityStructRegistry([]);
        var projectId = Guid.NewGuid();

        var fieldsJson = """
        [
            { "name": "SlotName", "label": "Slot Name", "type": "text" },
            { "name": "MaterialPath", "label": "Material Path", "type": "text" },
            { "name": "Roughness", "label": "Roughness Factor", "type": "number" },
            { "name": "IsActive", "label": "Active Status", "type": "boolean" },
            { "name": "Textures", "label": "Texture Bindings", "type": "key-value" }
        ]
        """;

        using var doc = JsonDocument.Parse(fieldsJson);
        var def = new DynamicEntityStructDefinition(
            "SlotBinding",
            "Slot Binding",
            Guid.NewGuid(),
            doc
        );

        registry.Register(def);
        return (registry, projectId);
    }

    [Fact]
    public void VariableTools_ShouldResolvePins_MatchingDeclaredVariable()
    {
        var (registry, projectId) = CreateTestRegistryWithSlotBinding();
        var declaredParameters = new List<Automation.Pipeline.Domain.ValueObjects.PipelineParameter>
        {
            new()
            {
                Key = "ResolvedSlotsMap",
                Label = "Resolved Slots Map",
                Kind = PipelineParameterKind.Variable,
                Type = PinPrimitiveType.EntityRef,
                Cardinality = PinCardinality.Map,
                StructType = "SlotBinding"
            }
        };

        var resolutionCtx = new PinResolutionContext(registry, projectId, declaredParameters);

        // 1. GetVariableTool
        var getVarTool = new Automation.Pipeline.Contracts.Tools.Variables.GetVariableTool();
        var getConfig = new Dictionary<string, object?> { ["VariableName"] = "ResolvedSlotsMap" };
        var (_, getOutputs) = getVarTool.ResolvePins(getConfig, resolutionCtx);

        var getValuePin = getOutputs.First(p => p.Id == "Value");
        getValuePin.PrimitiveType.Should().Be(PinPrimitiveType.EntityRef);
        getValuePin.Cardinality.Should().Be(PinCardinality.Map);
        getValuePin.Metadata.Should().Be("SlotBinding");

        // 2. SetVariableTool
        var setVarTool = new Automation.Pipeline.Contracts.Tools.Variables.SetVariableTool();

        // Check static declaration
        setVarTool.Inputs.Should().Contain(p => p.Kind == PinKind.Exec && p.Id == "exec_in");
        setVarTool.Outputs.Should().Contain(p => p.Kind == PinKind.Exec && p.Id == "exec_out");

        var setConfig = new Dictionary<string, object?> { ["VariableName"] = "ResolvedSlotsMap" };
        var (setInputs, setOutputs) = setVarTool.ResolvePins(setConfig, resolutionCtx);

        setInputs.Should().Contain(p => p.Kind == PinKind.Exec && p.Id == "exec_in");
        setOutputs.Should().Contain(p => p.Kind == PinKind.Exec && p.Id == "exec_out");

        var setInputValuePin = setInputs.First(p => p.Id == "Value");
        setInputValuePin.PrimitiveType.Should().Be(PinPrimitiveType.EntityRef);
        setInputValuePin.Cardinality.Should().Be(PinCardinality.Map);
        setInputValuePin.Metadata.Should().Be("SlotBinding");

        var setOutputValuePin = setOutputs.First(p => p.Id == "Value");
        setOutputValuePin.PrimitiveType.Should().Be(PinPrimitiveType.EntityRef);
        setOutputValuePin.Cardinality.Should().Be(PinCardinality.Map);
        setOutputValuePin.Metadata.Should().Be("SlotBinding");
    }

    [Fact]
    public async Task SetVariableTool_ExecuteAsync_ShouldSetVariableAndBroadcastSignalR()
    {
        var memoryStore = Substitute.For<IExecutionMemoryStore>();
        var hubContext = Substitute.For<Microsoft.AspNetCore.SignalR.IHubContext<PipelineExecutionHub>>();
        var hubClients = Substitute.For<Microsoft.AspNetCore.SignalR.IHubClients>();
        var clientProxy = Substitute.For<Microsoft.AspNetCore.SignalR.IClientProxy>();

        hubContext.Clients.Returns(hubClients);
        hubClients.Group(Arg.Any<string>()).Returns(clientProxy);

        var tool = new SetVariableTool(memoryStore, hubContext);

        var execId = Guid.NewGuid();
        var pipeId = Guid.NewGuid();
        var context = new ToolExecutionContext(execId, pipeId, CancellationToken.None);

        var inputs = new Dictionary<string, object>
        {
            ["VariableName"] = "TargetDir",
            ["Value"] = "D:/Project/Assets"
        };

        var result = await tool.ExecuteAsync(inputs, context);

        result["Value"].Should().Be("D:/Project/Assets");
        await memoryStore.Received(1).SetVariableAsync(execId, "TargetDir", "D:/Project/Assets", Arg.Any<CancellationToken>());
        await clientProxy.Received(2).SendCoreAsync("PipelineVariableChanged", Arg.Any<object?[]>(), Arg.Any<CancellationToken>());
    }
}
