using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Contracts.StructRegistry;
using Automation.Pipeline.Contracts.StructRegistry.Definitions;
using Automation.Pipeline.Contracts.Tools;
using Automation.Pipeline.Contracts.Tools.Construct;
using Automation.Pipeline.Contracts.Tools.Deconstruct;
using Automation.Pipeline.Constants;
using Automation.Runner.Contracts;
using FluentAssertions;
using FluentResults;
using NSubstitute;
using Xunit;

namespace Automation.Pipeline.Tests;

public class DynamicStructToolsTests
{
    private readonly ToolExecutionContext _context = new(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

    private static (EntityStructRegistry registry, Guid projectId) CreateTestRegistryWithSlotBinding()
    {
        var registry = new EntityStructRegistry([]);
        var projectId = Guid.NewGuid();

        var fieldsJson = """
        [
            { "name": "SlotName", "label": "Slot Name", "type": "text" },
            { "name": "MaterialPath", "label": "Material Path", "type": "text" },
            { "name": "Roughness", "label": "Roughness Factor", "type": "number" },
            { "name": "Textures", "label": "Texture Bindings", "type": "struct", "properties": { "cardinality": "array" } }
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
    public void MakeStructTool_ShouldResolvePins_ForDynamicStruct()
    {
        var (registry, projectId) = CreateTestRegistryWithSlotBinding();
        var tool = new MakeStructTool(registry);

        var config = new Dictionary<string, object?>
        {
            ["StructType"] = "SlotBinding"
        };
        var resolutionCtx = new PinResolutionContext(registry, projectId);

        var (inputs, outputs) = tool.ResolvePins(config, resolutionCtx);

        inputs.Should().Contain(p => p.Id == "SlotName" && p.PrimitiveType == PinPrimitiveType.String);
        inputs.Should().Contain(p => p.Id == "MaterialPath" && p.PrimitiveType == PinPrimitiveType.String);
        inputs.Should().Contain(p => p.Id == "Roughness" && p.PrimitiveType == PinPrimitiveType.Number);
        inputs.Should().Contain(p => p.Id == "Textures" && p.PrimitiveType == PinPrimitiveType.EntityRef && p.Cardinality == PinCardinality.Array);
        inputs.Should().Contain(p => p.Id == "StructType");

        outputs.Should().HaveCount(1);
        outputs[0].Id.Should().Be("Result");
        outputs[0].Metadata.Should().Be("SlotBinding");
    }

    [Fact]
    public async Task MakeStructTool_ShouldPackData_IntoStructObject()
    {
        var (registry, _) = CreateTestRegistryWithSlotBinding();
        var tool = new MakeStructTool(registry);

        var inputs = new Dictionary<string, object>
        {
            ["StructType"] = "SlotBinding",
            ["SlotName"] = "Slot_Body",
            ["MaterialPath"] = "Content/Materials/M_Body.uasset",
            ["Roughness"] = 0.85
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        result.Should().ContainKey("Result");
        var packed = result["Result"] as Dictionary<string, object?>;
        packed.Should().NotBeNull();
        packed!["$type"].Should().Be("SlotBinding");
        packed["SlotName"].Should().Be("Slot_Body");
        packed["MaterialPath"].Should().Be("Content/Materials/M_Body.uasset");
        packed["Roughness"].Should().Be(0.85);
    }

    [Fact]
    public void BreakStructTool_ShouldResolvePins_ForDynamicStruct()
    {
        var (registry, projectId) = CreateTestRegistryWithSlotBinding();
        var tool = new BreakStructTool(registry);

        var config = new Dictionary<string, object?>
        {
            ["StructType"] = "SlotBinding"
        };
        var resolutionCtx = new PinResolutionContext(registry, projectId);

        var (_, outputs) = tool.ResolvePins(config, resolutionCtx);

        outputs.Should().Contain(p => p.Id == "SlotName" && p.PrimitiveType == PinPrimitiveType.String);
        outputs.Should().Contain(p => p.Id == "MaterialPath" && p.PrimitiveType == PinPrimitiveType.String);
        outputs.Should().Contain(p => p.Id == "Roughness" && p.PrimitiveType == PinPrimitiveType.Number);
        outputs.Should().Contain(p => p.Id == "Textures" && p.PrimitiveType == PinPrimitiveType.EntityRef && p.Cardinality == PinCardinality.Array);
    }

    [Fact]
    public async Task BreakStructTool_ShouldUnpackData_FromDynamicStruct()
    {
        var (registry, _) = CreateTestRegistryWithSlotBinding();
        var tool = new BreakStructTool(registry);

        var payload = new Dictionary<string, object?>
        {
            ["$type"] = "SlotBinding",
            ["SlotName"] = "Slot_Body",
            ["MaterialPath"] = "Content/Materials/M_Body.uasset",
            ["Roughness"] = 0.85
        };

        var inputs = new Dictionary<string, object>
        {
            ["Target"] = payload,
            ["StructType"] = "SlotBinding"
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        result["SlotName"].Should().Be("Slot_Body");
        result["MaterialPath"].Should().Be("Content/Materials/M_Body.uasset");
        result["Roughness"].Should().Be(0.85);
    }

    [Fact]
    public async Task RoundTrip_MakeStructThenBreakStruct_ShouldPreserveData()
    {
        var (registry, _) = CreateTestRegistryWithSlotBinding();
        var makeTool = new MakeStructTool(registry);
        var breakTool = new BreakStructTool(registry);

        // 1. Pack
        var makeInputs = new Dictionary<string, object>
        {
            ["StructType"] = "SlotBinding",
            ["SlotName"] = "Slot_Head",
            ["MaterialPath"] = "M_Head.uasset",
            ["Roughness"] = 0.4
        };
        var makeResult = await makeTool.ExecuteAsync(makeInputs, _context);

        // 2. Unpack
        var breakInputs = new Dictionary<string, object>
        {
            ["Target"] = makeResult["Result"],
            ["StructType"] = "SlotBinding"
        };
        var breakResult = await breakTool.ExecuteAsync(breakInputs, _context);

        // 3. Verify
        breakResult["SlotName"].Should().Be("Slot_Head");
        breakResult["MaterialPath"].Should().Be("M_Head.uasset");
        breakResult["Roughness"].Should().Be(0.4);
    }

    [Fact]
    public async Task BreakStructTool_ShouldResolveAndUnpack_RunnerStaticStruct()
    {
        var runnerId = Guid.NewGuid();
        var runnerApi = Substitute.For<IRunnerApi>();
        runnerApi.GetRunnerByIdAsync(runnerId, Arg.Any<CancellationToken>())
            .Returns(Result.Ok(new RunnerDto(
                runnerId,
                "Render-Node-01",
                "MACHINE-01",
                true,
                DateTimeOffset.UtcNow,
                DateTimeOffset.UtcNow,
                true,
                "Windows",
                "Intel i9-14900K"
            )));

        var staticDefs = new List<IEntityStructDefinition> { new RunnerStructDefinition(runnerApi) };
        var registry = new EntityStructRegistry(staticDefs, null);
        var breakTool = new BreakStructTool(registry);

        // 1. Check resolve pins
        var (inputs, outputs) = breakTool.ResolvePins(new Dictionary<string, object?> { ["StructType"] = WellKnownStructTypes.Runner });
        outputs.Should().Contain(p => p.Id == "RunnerName" && p.PrimitiveType == PinPrimitiveType.String);
        outputs.Should().Contain(p => p.Id == "OsPlatform" && p.PrimitiveType == PinPrimitiveType.String);
        outputs.Should().Contain(p => p.Id == "CpuModel" && p.PrimitiveType == PinPrimitiveType.String);

        // 2. Unpack runner entity ref
        var breakInputs = new Dictionary<string, object>
        {
            ["Target"] = $"Runner:{runnerId}",
            ["StructType"] = WellKnownStructTypes.Runner
        };

        var breakResult = await breakTool.ExecuteAsync(breakInputs, _context);

        breakResult["RunnerName"].Should().Be("Render-Node-01");
        breakResult["MachineKey"].Should().Be("MACHINE-01");
        breakResult["OsPlatform"].Should().Be("Windows");
        breakResult["CpuModel"].Should().Be("Intel i9-14900K");
    }
}

