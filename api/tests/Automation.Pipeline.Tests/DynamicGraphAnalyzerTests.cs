using System.Text.Json;
using Automation.Pipeline.Domain.Entities;
using PipelineEntity = Automation.Pipeline.Domain.Entities.Pipeline;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.Analysis;
using Automation.Pipeline.Engine.DataResolver;
using Automation.Pipeline.Engine.DataResolver.Resolvers;
using Automation.Pipeline.Infrastructure.Redis;
using Automation.Pipeline.Tools;
using Automation.Pipeline.Tools.Variables;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Automation.Pipeline.Tests;

public class DynamicGraphAnalyzerTests
{
    private class StaticPureTool : IResolverTool
    {
        public string Key => "StaticPureTool";
        public string Label => "Static Pure Tool";
        public bool IsPure => true;
        public bool IsDynamic => false;
        public IReadOnlyList<PinDefinition> Inputs =>
        [
            new() { Id = "InText", Label = "In Text", PrimitiveType = PinPrimitiveType.String }
        ];
        public IReadOnlyList<PinDefinition> Outputs =>
        [
            new() { Id = "OutText", Label = "Out Text", PrimitiveType = PinPrimitiveType.String }
        ];

        public int ExecutionCount { get; private set; }

        public Task<Dictionary<string, object>> ExecuteAsync(Dictionary<string, object> inputs, ToolExecutionContext context)
        {
            ExecutionCount++;
            var inputVal = inputs.GetValueOrDefault("InText")?.ToString() ?? "";
            return Task.FromResult(new Dictionary<string, object>
            {
                ["OutText"] = $"Processed: {inputVal}"
            });
        }
    }

    private class TestToolRegistry : IToolRegistry
    {
        private readonly List<IResolverTool> _tools = [];

        public void Register(IResolverTool tool) => _tools.Add(tool);
        public IReadOnlyList<IResolverTool> GetAll() => _tools;
        public IResolverTool? GetByKey(string key) => _tools.FirstOrDefault(t => string.Equals(t.Key, key, StringComparison.OrdinalIgnoreCase));
    }

    private class TestGraphProvider : IPipelineGraphProvider
    {
        private readonly Dictionary<Guid, PipelineEntity> _map = new();

        public void Register(Guid execId, PipelineEntity p) => _map[execId] = p;

        public Task<PipelineExecution?> GetExecutionByIdAsync(Guid executionId, CancellationToken ct = default)
            => Task.FromResult<PipelineExecution?>(new PipelineExecution(_map.GetValueOrDefault(executionId)?.Id ?? Guid.NewGuid()));

        public Task<PipelineEntity?> GetPipelineByExecutionIdAsync(Guid executionId, CancellationToken ct = default)
            => Task.FromResult(_map.GetValueOrDefault(executionId));

        public Task<PipelineEntity?> GetPipelineByIdAsync(Guid pipelineId, CancellationToken ct = default)
            => Task.FromResult(_map.Values.FirstOrDefault(p => p.Id == pipelineId));
    }

    [Fact]
    public void AnalyzeDynamicNodes_ShouldIdentifyRootDynamicAndTaintDownstreamPureNodes()
    {
        var registry = new TestToolRegistry();
        var staticTool = new StaticPureTool();
        var getVarTool = new GetVariableTool();
        registry.Register(staticTool);
        registry.Register(getVarTool);

        var pipeline = new PipelineEntity(Guid.NewGuid(), "TestPipeline");

        // Node 1: GetVariable (Root Dynamic)
        var getVarNode = new PipelineNode(Guid.NewGuid(), pipeline.Id, getVarTool.Key, "Tool", 0, 0);
        pipeline.AddNode(getVarNode);

        // Node 2: Static Pure Tool (Tainted by Node 1)
        var taintedNode = new PipelineNode(Guid.NewGuid(), pipeline.Id, staticTool.Key, "Tool", 100, 0);
        pipeline.AddNode(taintedNode);

        // Node 3: Static Pure Tool (Independent - NOT Tainted)
        var independentNode = new PipelineNode(Guid.NewGuid(), pipeline.Id, staticTool.Key, "Tool", 200, 0);
        pipeline.AddNode(independentNode);

        // Edge: getVarNode -> taintedNode
        pipeline.AddEdge(getVarNode.Id, "Value", taintedNode.Id, "InText");

        // Action
        var dynamicNodes = PipelineGraphAnalyzer.AnalyzeDynamicNodes(pipeline, registry);

        // Assert
        dynamicNodes.Should().Contain(getVarNode.Id, "GetVariableTool is directly dynamic");
        dynamicNodes.Should().Contain(taintedNode.Id, "taintedNode receives data from dynamic node");
        dynamicNodes.Should().NotContain(independentNode.Id, "independentNode has no connection to dynamic node");
    }

    [Fact]
    public async Task PureNodeResolver_WhenNodeIsDynamic_ShouldNotCacheAndAlwaysFetchLatestState()
    {
        var memoryStore = new RedisExecutionMemoryStore(NullLogger<RedisExecutionMemoryStore>.Instance);
        var graphProvider = new TestGraphProvider();
        var toolRegistry = new TestToolRegistry();
        var getVarTool = new GetVariableTool(memoryStore);
        toolRegistry.Register(getVarTool);

        var assetApi = NSubstitute.Substitute.For<Automation.Files.Contracts.IAssetApi>();
        var assetResolver = new AssetResolver(assetApi, NullLogger<AssetResolver>.Instance);
        var pureResolver = new PureNodeResolver(toolRegistry, memoryStore, graphProvider, NullLogger<PureNodeResolver>.Instance);
        var pinResolver = new PinValueResolver(graphProvider, memoryStore, toolRegistry, pureResolver, assetResolver, NullLogger<PinValueResolver>.Instance);

        var execId = Guid.NewGuid();
        var pipeline = new PipelineEntity(Guid.NewGuid(), "DynamicExecPipeline");

        var configDoc = JsonDocument.Parse("{\"VariableName\": \"TargetList\"}");
        var getVarNode = new PipelineNode(Guid.NewGuid(), pipeline.Id, getVarTool.Key, "Tool", 0, 0, configDoc);
        pipeline.AddNode(getVarNode);
        graphProvider.Register(execId, pipeline);

        // T0: Initial variable value in Redis is empty dictionary
        await memoryStore.SetVariableAsync(execId, "TargetList", new Dictionary<string, string>(), CancellationToken.None);

        // First resolution: should resolve to empty dictionary
        var resultT0 = await pureResolver.ResolvePureNodeOutputAsync(execId, getVarNode, "Value", null, pinResolver);
        var serializedT0 = JsonSerializer.Serialize(resultT0);
        serializedT0.Should().NotContain("path/to/mesh.fbx");

        // T1: Later in execution, loop or action node updates TargetList
        var updatedDict = new Dictionary<string, string>
        {
            ["item1"] = "path/to/mesh.fbx",
            ["item2"] = "path/to/pants.fbx"
        };
        await memoryStore.SetVariableAsync(execId, "TargetList", updatedDict, CancellationToken.None);

        // Second resolution: because GetVariable is dynamic, it MUST NOT hit stale cache
        var resultT1 = await pureResolver.ResolvePureNodeOutputAsync(execId, getVarNode, "Value", null, pinResolver);
        var serializedT1 = JsonSerializer.Serialize(resultT1);
        serializedT1.Should().Contain("path/to/mesh.fbx");
        serializedT1.Should().Contain("path/to/pants.fbx");
    }
}
