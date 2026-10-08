using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Engine.StructRegistry;
using Automation.Pipeline.Engine.StructRegistry.Definitions;
using Automation.Pipeline.Tools;
using Automation.Pipeline.Tools.Construct;
using Automation.Pipeline.Tools.Utility;
using Automation.Pipeline.Engine.DataResolver;
using Automation.Pipeline.Hubs;
using Automation.Pipeline.Tools.Variables;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace Automation.Pipeline.Tests;

public class UniversalDataPrimitivesTests
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

    private const string SampleRawMetadata = """
    {
        "asset_name": "Maria_Armor",
        "cloth_type": "Top",
        "metadata": {
            "objects": [
                {
                    "name": "Mesh_Body",
                    "slots": [
                        {
                            "name": "Slot_Body",
                            "material_name": "M_Body",
                            "textures": [
                                { "socket": "BaseColor", "file_path": "D:/Textures/Body_D.png" },
                                { "socket": "Normal", "file_path": "D:/Textures/Body_N.png" }
                            ]
                        },
                        {
                            "name": "Slot_Armor",
                            "material_name": "M_Armor",
                            "textures": [
                                { "socket": "BaseColor", "file_path": "D:/Textures/Armor_D.png" }
                            ]
                        }
                    ]
                }
            ]
        }
    }
    """;

    [Fact]
    public async Task GetByPathTool_ShouldExtractScalarProperty()
    {
        var tool = new GetByPathTool();
        var inputs = new Dictionary<string, object>
        {
            ["Source"] = SampleRawMetadata,
            ["Path"] = "$.asset_name"
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        result["Found"].Should().Be(true);
        result["Count"].Should().Be(1);
        result["Value"].Should().Be("Maria_Armor");
    }

    [Fact]
    public async Task GetByPathTool_ShouldExtractNestedArrayWildcard()
    {
        var tool = new GetByPathTool();
        var inputs = new Dictionary<string, object>
        {
            ["Source"] = SampleRawMetadata,
            ["Path"] = "$.metadata.objects[0].slots[*].name"
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        result["Found"].Should().Be(true);
        result["Count"].Should().Be(2);

        var values = result["Values"] as List<string>;
        values.Should().NotBeNull();
        values.Should().Contain("Slot_Body");
        values.Should().Contain("Slot_Armor");
    }

    [Fact]
    public async Task GetByPathTool_ShouldSupportRecursiveDescent()
    {
        var tool = new GetByPathTool();
        var inputs = new Dictionary<string, object>
        {
            ["Source"] = SampleRawMetadata,
            ["Path"] = "..file_path"
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        result["Found"].Should().Be(true);
        result["Count"].Should().Be(3);

        var values = result["Values"] as List<string>;
        values.Should().NotBeNull();
        values.Should().Contain("D:/Textures/Body_D.png");
        values.Should().Contain("D:/Textures/Body_N.png");
        values.Should().Contain("D:/Textures/Armor_D.png");
    }

    [Fact]
    public async Task GetByPathTool_WhenPathNotFound_ShouldReturnEmptyAndFoundFalse()
    {
        var tool = new GetByPathTool();
        var inputs = new Dictionary<string, object>
        {
            ["Source"] = SampleRawMetadata,
            ["Path"] = "$.non_existent_key.sub_field"
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        result["Found"].Should().Be(false);
        result["Count"].Should().Be(0);
        result["Value"].Should().Be(string.Empty);
    }

    [Fact]
    public void CastToStructTool_ShouldResolvePins_MatchingStructDefinition()
    {
        var (registry, projectId) = CreateTestRegistryWithSlotBinding();
        var tool = new CastToStructTool(registry);

        var config = new Dictionary<string, object?>
        {
            ["StructType"] = "SlotBinding"
        };
        var resolutionCtx = new PinResolutionContext(registry, projectId);

        var (inputs, outputs) = tool.ResolvePins(config, resolutionCtx);

        inputs.Should().Contain(p => p.Id == "Source");
        inputs.Should().Contain(p => p.Id == "StructType");

        outputs.Should().Contain(p => p.Id == "Result" && p.PrimitiveType == PinPrimitiveType.EntityRef);
        outputs.Should().Contain(p => p.Id == "IsValid" && p.PrimitiveType == PinPrimitiveType.Boolean);
        outputs.Should().Contain(p => p.Id == "SlotName" && p.PrimitiveType == PinPrimitiveType.String);
        outputs.Should().Contain(p => p.Id == "MaterialPath" && p.PrimitiveType == PinPrimitiveType.String);
        outputs.Should().Contain(p => p.Id == "Roughness" && p.PrimitiveType == PinPrimitiveType.Number);
        outputs.Should().Contain(p => p.Id == "IsActive" && p.PrimitiveType == PinPrimitiveType.Boolean);
        outputs.Should().Contain(p => p.Id == "Textures" && p.Cardinality == PinCardinality.Map);
    }

    [Fact]
    public async Task CastToStructTool_ShouldCoerceSnakeCaseAndTypes_IntoStruct()
    {
        var (registry, _) = CreateTestRegistryWithSlotBinding();
        var tool = new CastToStructTool(registry);

        // Giả lập dữ liệu thô với snake_case và kiểu dữ liệu dạng chuỗi cần coerce
        var rawSource = new Dictionary<string, object?>
        {
            ["slot_name"] = "Slot_Armor",
            ["material_path"] = "/Game/Materials/M_Armor",
            ["roughness"] = "0.75",
            ["is_active"] = "true",
            ["textures"] = new List<string> { "T_Armor_BaseColor.png", "T_Armor_Normal.png" }
        };

        var inputs = new Dictionary<string, object>
        {
            ["Source"] = rawSource,
            ["StructType"] = "SlotBinding"
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        result["IsValid"].Should().Be(true);
        result["SlotName"].Should().Be("Slot_Armor");
        result["MaterialPath"].Should().Be("/Game/Materials/M_Armor");
        result["Roughness"].Should().Be(0.75);
        result["IsActive"].Should().Be(true);

        var packed = result["Result"] as Dictionary<string, object?>;
        packed.Should().NotBeNull();
        packed!["$type"].Should().Be("SlotBinding");
        packed["SlotName"].Should().Be("Slot_Armor");
        packed["Roughness"].Should().Be(0.75);
    }

    [Fact]
    public async Task EndToEnd_ExtractWithGetByPath_ThenCastToStruct_ShouldWorkSeamlessly()
    {
        var (registry, _) = CreateTestRegistryWithSlotBinding();
        var getByPathTool = new GetByPathTool();
        var castTool = new CastToStructTool(registry);

        // 1. Dùng GetByPath bóc tách 1 slot từ metadata lồng nhau
        var getInputs = new Dictionary<string, object>
        {
            ["Source"] = SampleRawMetadata,
            ["Path"] = "$.metadata.objects[0].slots[0]"
        };

        var getResult = await getByPathTool.ExecuteAsync(getInputs, _context);
        getResult["Found"].Should().Be(true);
        var slotRawJson = getResult["Value"].ToString();
        slotRawJson.Should().NotBeNullOrEmpty();

        // 2. Ép kiểu raw slot sang SlotBinding struct
        var castInputs = new Dictionary<string, object>
        {
            ["Source"] = slotRawJson!,
            ["StructType"] = "SlotBinding"
        };

        var castResult = await castTool.ExecuteAsync(castInputs, _context);

        // 3. Kiểm tra kết quả
        castResult["IsValid"].Should().Be(true);
        // Trong raw JSON: "name": "Slot_Body", "material_name": "M_Body"
        // Đối chiếu: field "SlotName" khớp với "name" (qua fallback) hoặc exact name
        castResult["Result"].Should().NotBeNull();
    }

    [Fact]
    public void GetByPathTool_ResolvePins_ShouldAdaptCardinality_BasedOnPath()
    {
        var tool = new GetByPathTool();

        // 1. Array path
        var arrayConfig = new Dictionary<string, object?> { ["Path"] = "$.metadata.slots[*]" };
        var (_, arrayOutputs) = tool.ResolvePins(arrayConfig);
        var arrayResultPin = arrayOutputs.First(p => p.Id == "Result");
        arrayResultPin.Cardinality.Should().Be(PinCardinality.Array);

        // 2. Scalar path
        var scalarConfig = new Dictionary<string, object?> { ["Path"] = "$.asset_name" };
        var (_, scalarOutputs) = tool.ResolvePins(scalarConfig);
        var scalarResultPin = scalarOutputs.First(p => p.Id == "Result");
        scalarResultPin.Cardinality.Should().Be(PinCardinality.Single);
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
        var getVarTool = new Automation.Pipeline.Tools.Variables.GetVariableTool();
        var getConfig = new Dictionary<string, object?> { ["VariableName"] = "ResolvedSlotsMap" };
        var (_, getOutputs) = getVarTool.ResolvePins(getConfig, resolutionCtx);

        var getValuePin = getOutputs.First(p => p.Id == "Value");
        getValuePin.PrimitiveType.Should().Be(PinPrimitiveType.EntityRef);
        getValuePin.Cardinality.Should().Be(PinCardinality.Map);
        getValuePin.Metadata.Should().Be("SlotBinding");

        // 2. SetVariableTool
        var setVarTool = new Automation.Pipeline.Tools.Variables.SetVariableTool();
        var setConfig = new Dictionary<string, object?> { ["VariableName"] = "ResolvedSlotsMap" };
        var (setInputs, setOutputs) = setVarTool.ResolvePins(setConfig, resolutionCtx);

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
