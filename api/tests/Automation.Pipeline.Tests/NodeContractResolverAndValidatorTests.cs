using Automation.Pipeline.Contracts.Tools.Struct;
using Automation.Pipeline.Contracts.NodeContract;
using Automation.Pipeline.Contracts.Validation;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Contracts.StructRegistry;
using Automation.Pipeline.Contracts.Tools;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace Automation.Pipeline.Tests;

public class NodeContractResolverAndValidatorTests
{
    private readonly IToolRegistry _toolRegistry;
    private readonly IEntityStructRegistry _structRegistry;

    public NodeContractResolverAndValidatorTests()
    {
        _toolRegistry = Substitute.For<IToolRegistry>();
        _structRegistry = Substitute.For<IEntityStructRegistry>();
    }

    [Fact]
    public void StartAndReturnNodes_ShouldMapStructTypeProperly_InResolvedNodeContract()
    {
        var resolver = new PipelineNodeContractResolver(null!, _toolRegistry, _structRegistry);
        var pipelineId = Guid.NewGuid();
        var projectId = Guid.NewGuid();

        var parameters = new List<PipelineParameter>
        {
            new()
            {
                Key = "Character",
                Label = "Target Character",
                Kind = PipelineParameterKind.Input,
                Type = PinPrimitiveType.EntityRef,
                Cardinality = PinCardinality.Single,
                StructType = "Resource",
                IsRequired = true
            },
            new()
            {
                Key = "ResultSummary",
                Label = "Summary Result",
                Kind = PipelineParameterKind.Output,
                Type = PinPrimitiveType.String,
                Cardinality = PinCardinality.Single,
                StructType = null
            }
        };

        var startNode = new PipelineNode(Guid.NewGuid(), pipelineId, "Start", PipelineNodeKind.Start, 0, 0);
        var returnNode = new PipelineNode(Guid.NewGuid(), pipelineId, "Return", PipelineNodeKind.Return, 500, 0);

        var context = new NodeContractResolutionContext(pipelineId, projectId, parameters);

        // Resolve Start Node
        var startContract = resolver.ResolveNode(startNode, context);
        startContract.Kind.Should().Be(PipelineNodeKind.Start);
        startContract.Outputs.Should().Contain(p => p.Id == "Character" && p.StructType == "Resource" && p.PrimitiveType == PinPrimitiveType.EntityRef);

        // Resolve Return Node
        var returnContract = resolver.ResolveNode(returnNode, context);
        returnContract.Kind.Should().Be(PipelineNodeKind.Return);
        returnContract.Inputs.Should().Contain(p => p.Id == "ResultSummary" && p.PrimitiveType == PinPrimitiveType.String);
    }

    [Fact]
    public void CustomNodeInstanceLabel_CanBeOverriddenViaMetadata()
    {
        var resolver = new PipelineNodeContractResolver(null!, _toolRegistry, _structRegistry);
        var pipelineId = Guid.NewGuid();
        var projectId = Guid.NewGuid();

        var metaJson = System.Text.Json.JsonDocument.Parse("""{"label": "My Renamed Node"}""");
        var node = new PipelineNode(Guid.NewGuid(), pipelineId, "Start", PipelineNodeKind.Start, 0, 0, metadata: metaJson);

        var context = new NodeContractResolutionContext(pipelineId, projectId, []);
        var contract = resolver.ResolveNode(node, context);

        contract.Label.Should().Be("My Renamed Node");
        contract.DefinitionLabel.Should().Be("Start");
        contract.RefId.Should().Be("Start");
    }

    [Fact]
    public async Task Validator_ShouldEmitDiagnosticError_WhenBreakStructHasNoStructType()
    {
        var resolver = Substitute.For<INodeContractResolver>();
        var validator = new PipelineContractValidator(resolver, _structRegistry);

        var pipeline = new Domain.Entities.Pipeline(Guid.NewGuid(), "TestPipeline");
        var breakNode = new PipelineNode(Guid.NewGuid(), pipeline.Id, "BreakStruct", PipelineNodeKind.Tool, 0, 0);
        pipeline.AddNode(breakNode);

        var contract = new ResolvedNodeContract(
            NodeId: breakNode.Id,
            RefId: "BreakStruct",
            Kind: PipelineNodeKind.Tool,
            Label: "Break Struct",
            DefinitionLabel: "Break Struct",
            Category: "Construct",
            Executor: "builtin",
            IsPure: true,
            IsFlowControl: false,
            SubPipelineId: null,
            NodeDefinitionId: null,
            Inputs: [],
            Outputs: [],
            ConfigValues: new Dictionary<string, object?>(), // No StructType!
            Metadata: null
        );

        var prebuiltContracts = new Dictionary<Guid, ResolvedNodeContract> { [breakNode.Id] = contract };
        var prebuiltContext = new NodeContractResolutionContext(pipeline.Id, pipeline.ProjectId);

        var result = await validator.ValidateGraphAsync(pipeline, prebuiltContext, prebuiltContracts);

        result.IsValid.Should().BeFalse();
        result.Diagnostics.Should().Contain(d =>
            d.Code == PipelineDiagnosticCode.UnselectedStructSchema &&
            d.Severity == PipelineDiagnosticSeverity.Error &&
            d.NodeId == breakNode.Id
        );
    }

    [Fact]
    public async Task Validator_ShouldEmitDiagnosticWarning_ForOrphanNode()
    {
        var resolver = Substitute.For<INodeContractResolver>();
        var validator = new PipelineContractValidator(resolver, _structRegistry);

        var pipeline = new Domain.Entities.Pipeline(Guid.NewGuid(), "TestPipeline");
        var orphanNode = new PipelineNode(Guid.NewGuid(), pipeline.Id, "FormatString", PipelineNodeKind.Tool, 0, 0);
        pipeline.AddNode(orphanNode);

        var contract = new ResolvedNodeContract(
            NodeId: orphanNode.Id,
            RefId: "FormatString",
            Kind: PipelineNodeKind.Tool,
            Label: "Format String",
            DefinitionLabel: "Format String",
            Category: "Utility",
            Executor: "builtin",
            IsPure: true,
            IsFlowControl: false,
            SubPipelineId: null,
            NodeDefinitionId: null,
            Inputs: [],
            Outputs: [],
            ConfigValues: null,
            Metadata: null
        );

        var prebuiltContracts = new Dictionary<Guid, ResolvedNodeContract> { [orphanNode.Id] = contract };
        var prebuiltContext = new NodeContractResolutionContext(pipeline.Id, pipeline.ProjectId);

        var result = await validator.ValidateGraphAsync(pipeline, prebuiltContext, prebuiltContracts);

        result.IsValid.Should().BeTrue(); // Warnings do not make IsValid false!
        result.Diagnostics.Should().Contain(d =>
            d.Code == PipelineDiagnosticCode.OrphanNode &&
            d.Severity == PipelineDiagnosticSeverity.Warning &&
            d.NodeId == orphanNode.Id
        );
    }

    [Fact]
    public void PipelineNodeContractResolver_MustHaveOnlyOnePublicConstructor_RequiringPipelineDbContext()
    {
        var publicCtors = typeof(PipelineNodeContractResolver).GetConstructors();
        publicCtors.Should().HaveCount(1, "Must have exactly one public constructor.");
        var ctor = publicCtors[0];
        ctor.GetParameters().Select(p => p.ParameterType).Should().Contain(typeof(Automation.Pipeline.Infrastructure.Persistence.PipelineDbContext));
    }
    [Fact]
    public void TopologyAwareStructInference_ShouldAutoInferStructTypeAndOutputPins_FromIncomingWire()
    {
        var pipelineId = Guid.NewGuid();
        var projectId = Guid.NewGuid();

        var parameters = new List<PipelineParameter>
        {
            new()
            {
                Key = "DazResource",
                Label = "Daz Resource",
                Kind = PipelineParameterKind.Input,
                Type = PinPrimitiveType.EntityRef,
                Cardinality = PinCardinality.Single,
                StructType = "Resource",
                IsRequired = true
            }
        };

        var startNode = new PipelineNode(Guid.NewGuid(), pipelineId, "Start", PipelineNodeKind.Start, 0, 0);
        var breakStructNode = new PipelineNode(Guid.NewGuid(), pipelineId, "BreakStruct", PipelineNodeKind.Tool, 300, 0);

        var edge = new PipelineEdge(
            pipelineId,
            startNode.Id,
            "DazResource",
            breakStructNode.Id,
            "Target"
        );

        var mockStructDef = Substitute.For<IEntityStructDefinition>();
        mockStructDef.StructType.Returns("Resource");
        mockStructDef.OutputPins.Returns(new List<PinDefinition>
        {
            new() { Id = "Id", Label = "Resource Id", PrimitiveType = PinPrimitiveType.String },
            new() { Id = "Name", Label = "Resource Name", PrimitiveType = PinPrimitiveType.String },
            new() { Id = "Path", Label = "Resource Path", PrimitiveType = PinPrimitiveType.String }
        });

        _structRegistry.Get("Resource", Arg.Any<Guid?>()).Returns(mockStructDef);
        _structRegistry.Get("Resource").Returns(mockStructDef);
        _toolRegistry.Get("BreakStruct").Returns(new BreakStructTool(_structRegistry));

        var resolver = PipelineNodeContractResolver.CreateWithoutDatabase(_toolRegistry, _structRegistry);
        var context = new NodeContractResolutionContext(
            pipelineId,
            projectId,
            parameters,
            edges: new List<PipelineEdge> { edge }
        );

        var contracts = resolver.ResolveAllNodes(new List<PipelineNode> { startNode, breakStructNode }, context);

        contracts.Should().ContainKey(breakStructNode.Id);
        var breakContract = contracts[breakStructNode.Id];

        breakContract.ConfigValues.Should().NotBeNull();
        breakContract.ConfigValues!["StructType"]?.ToString().Should().Be("Resource");
        breakContract.Inputs.Should().Contain(p => p.Id == "Target" && p.StructType == "Resource");
        breakContract.Outputs.Should().Contain(p => p.Id == "Id" && p.PrimitiveType == PinPrimitiveType.String);
        breakContract.Outputs.Should().Contain(p => p.Id == "Name" && p.PrimitiveType == PinPrimitiveType.String);
        breakContract.Outputs.Should().Contain(p => p.Id == "Path" && p.PrimitiveType == PinPrimitiveType.String);
    }

    [Fact]
    public async Task Validator_WhenFilePinIsUnbound_ShouldReportErrorDiagnostic()
    {
        var pipeline = new Domain.Entities.Pipeline(Guid.NewGuid(), "Unbound Test");
        var node = new PipelineNode(Guid.NewGuid(), pipeline.Id, "ImportTool", PipelineNodeKind.Tool, 0, 0);
        pipeline.AddNode(node);

        var validator = new PipelineContractValidator(
            Substitute.For<INodeContractResolver>(),
            _structRegistry
        );

        var contract = new ResolvedNodeContract(
            NodeId: node.Id,
            RefId: "ImportTool",
            Kind: PipelineNodeKind.Tool,
            Label: "Import Tool",
            DefinitionLabel: "Import Tool",
            Category: "Tools",
            Executor: "builtin",
            IsPure: false,
            IsFlowControl: false,
            SubPipelineId: null,
            NodeDefinitionId: null,
            Inputs: new List<PinDefinition>
            {
                new()
                {
                    Id = "InputFile",
                    Label = "Input Preset File",
                    PrimitiveType = PinPrimitiveType.Asset,
                    IsRequired = true
                }
            },
            Outputs: [],
            ConfigValues: new Dictionary<string, object?>
            {
                ["InputFile"] = new Dictionary<string, object?>
                {
                    ["status"] = "unbound",
                    ["originalFileName"] = "missing_character.fbx"
                }
            },
            Metadata: null
        );

        var prebuiltContracts = new Dictionary<Guid, ResolvedNodeContract> { [node.Id] = contract };
        var prebuiltContext = new NodeContractResolutionContext(pipeline.Id, pipeline.ProjectId);

        var result = await validator.ValidateGraphAsync(pipeline, prebuiltContext, prebuiltContracts);

        result.IsValid.Should().BeFalse();
        result.Diagnostics.Should().Contain(d =>
            d.Code == PipelineDiagnosticCode.UnresolvedRequiredPin &&
            d.Severity == PipelineDiagnosticSeverity.Error &&
            d.PinId == "InputFile" &&
            d.Message.Contains("missing_character.fbx") &&
            d.Message.Contains("unbound")
        );
    }
}
