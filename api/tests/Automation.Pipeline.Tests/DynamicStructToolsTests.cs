using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Engine.StructRegistry;
using Automation.Pipeline.Engine.StructRegistry.Definitions;
using Automation.Pipeline.Tools;
using Automation.Pipeline.Tools.Construct;
using Automation.Pipeline.Tools.Deconstruct;
using FluentAssertions;
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
    public async Task BreakStructTool_ShouldResolveAndUnpack_TaggedAssetStaticStruct()
    {
        var staticDefs = new List<IEntityStructDefinition> { new TaggedAssetStructDefinition() };
        var registry = new EntityStructRegistry(staticDefs, null);
        var breakTool = new BreakStructTool(registry);

        // 1. Check resolve pins
        var (inputs, outputs) = breakTool.ResolvePins(new Dictionary<string, object?> { ["StructType"] = "TaggedAsset" });
        outputs.Should().Contain(p => p.Id == "AssetName" && p.PrimitiveType == PinPrimitiveType.String);
        outputs.Should().Contain(p => p.Id == "FilePath" && p.PrimitiveType == PinPrimitiveType.Path);
        outputs.Should().Contain(p => p.Id == "TagMap" && p.Cardinality == PinCardinality.Map);
        outputs.Should().Contain(p => p.Id == "ResourceTags" && p.Cardinality == PinCardinality.Array);

        // 2. Unpack asset dictionary (similar to BuildTagMapFromResourceTool output)
        var assetObj = new Dictionary<string, object?>
        {
            ["resource_id"] = "res-123",
            ["version_id"] = "ver-456",
            ["asset_name"] = "Hero_Model",
            ["relative_path"] = "Characters/Hero.fbx",
            ["file_path"] = "D:/Project/Characters/Hero.fbx",
            ["resource_tags"] = new[] { "Character", "Hero" },
            ["tag_map"] = new Dictionary<string, object> { ["material"] = "M_Hero" },
            ["path_map"] = new Dictionary<string, object> { ["Characters/Hero.fbx"] = "Hero" },
            ["metadata"] = "{}"
        };

        var breakInputs = new Dictionary<string, object>
        {
            ["Target"] = assetObj,
            ["StructType"] = "TaggedAsset"
        };

        var breakResult = await breakTool.ExecuteAsync(breakInputs, _context);

        breakResult["AssetName"].Should().Be("Hero_Model");
        breakResult["FilePath"].Should().Be("D:/Project/Characters/Hero.fbx");
        breakResult["RelativePath"].Should().Be("Characters/Hero.fbx");
        breakResult["ResourceTags"].Should().BeAssignableTo<IEnumerable<string>>();
        breakResult["TagMap"].Should().BeAssignableTo<IDictionary<string, object>>();
    }
}

