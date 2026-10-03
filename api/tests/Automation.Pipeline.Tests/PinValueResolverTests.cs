using System.Text.Json;
using Automation.Files.Contracts;
using Automation.Pipeline.Domain.Entities;
using PipelineEntity = Automation.Pipeline.Domain.Entities.Pipeline;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.DataResolver;
using Automation.Pipeline.Engine.DataResolver.Resolvers;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Infrastructure.Redis;
using Automation.Pipeline.Tools;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace Automation.Pipeline.Tests;

public class PinValueResolverTests
{
    private readonly FakePipelineGraphProvider _graphProvider = new();
    private readonly IAssetApi _assetApi = Substitute.For<IAssetApi>();
    private readonly IExecutionMemoryStore _memoryStore = new RedisExecutionMemoryStore(NullLogger<RedisExecutionMemoryStore>.Instance);
    private readonly FakeToolRegistry _toolRegistry = new();
    private readonly AssetResolver _assetResolver;
    private readonly PureNodeResolver _pureNodeResolver;
    private readonly PinValueResolver _resolver;

    public PinValueResolverTests()
    {
        _assetResolver = new AssetResolver(_assetApi, NullLogger<AssetResolver>.Instance);
        _pureNodeResolver = new PureNodeResolver(_toolRegistry, _memoryStore, _graphProvider, NullLogger<PureNodeResolver>.Instance);
        _resolver = new PinValueResolver(
            _graphProvider,
            _memoryStore,
            _toolRegistry,
            _pureNodeResolver,
            _assetResolver,
            NullLogger<PinValueResolver>.Instance
        );
    }

    [Fact]
    public async Task ResolvePinAsync_FromInlineConfig_ShouldReturnConfigValue()
    {
        var execId = Guid.NewGuid();
        var pipeline = CreatePipeline("ConfigPipeline");

        var configDoc = JsonDocument.Parse("{\"MeshPath\": \"D:/assets/model.fbx\", \"Scale\": 1.5}");
        var node = new PipelineNode(Guid.NewGuid(), pipeline.Id, "ImportTool", "Tool", 0, 0, configDoc);
        pipeline.AddNode(node);

        _graphProvider.Register(execId, pipeline);

        var pathVal = await _resolver.ResolvePinAsync(execId, node.Id, "MeshPath");
        var scaleVal = await _resolver.ResolvePinAsync(execId, node.Id, "Scale");

        pathVal.Should().Be("D:/assets/model.fbx");
        scaleVal.Should().Be(1.5);
    }

    [Fact]
    public async Task ResolvePinAsync_FromScopeContext_ShouldReturnIterationVariable()
    {
        var execId = Guid.NewGuid();
        var pipeline = CreatePipeline("ScopePipeline");

        var node = new PipelineNode(Guid.NewGuid(), pipeline.Id, "ProcessTool", "Tool", 0, 0);
        pipeline.AddNode(node);
        _graphProvider.Register(execId, pipeline);

        var rootScope = new ScopeContext("root");
        var iterScope = rootScope.BuildChildScope("loop_meshes", iterationIndex: 3);
        iterScope.SetValue("Item", "HeroMesh_LOD0");
        iterScope.SetValue("Index", 3);

        var itemVal = await _resolver.ResolvePinAsync(execId, node.Id, "Item", iterScope);
        var indexVal = await _resolver.ResolvePinAsync(execId, node.Id, "Index", iterScope);

        itemVal.Should().Be("HeroMesh_LOD0");
        indexVal.Should().Be(3);
    }

    [Fact]
    public async Task ResolvePinAsync_UpstreamPureNode_ShouldComputeOnDemandAndMemoize()
    {
        var execId = Guid.NewGuid();
        var pipeline = CreatePipeline("PureNodePipeline");

        // Pure Node (StringAppend) -> Action Node (Import)
        var pureConfig = JsonDocument.Parse("{\"Prefix\": \"Base_\", \"Suffix\": \".fbx\"}");
        var pureNode = new PipelineNode(Guid.NewGuid(), pipeline.Id, "AppendString", "Tool", 0, 0, pureConfig);

        var actionNode = new PipelineNode(Guid.NewGuid(), pipeline.Id, "ImportMesh", "Tool", 0, 0);

        pipeline.AddNode(pureNode);
        pipeline.AddNode(actionNode);

        // Data wire: PureNode.Result -> ActionNode.FilePath
        pipeline.AddEdge(pureNode.Id, "Result", actionNode.Id, "FilePath");

        _graphProvider.Register(execId, pipeline);

        // Act: Action node demands "FilePath"
        var resolvedPath = await _resolver.ResolvePinAsync(execId, actionNode.Id, "FilePath");

        resolvedPath.Should().Be("Base_Appended.fbx");

        // Verify Memoization in memory store
        var cachedInStore = await _memoryStore.GetNodePinValueAsync(execId, pureNode.Id, "Result");
        cachedInStore.Should().Be("Base_Appended.fbx");
    }

    [Fact]
    public async Task ResolvePinAsync_NestedLoopIsolation_ShouldMaintainSeparateCaches()
    {
        var execId = Guid.NewGuid();
        var pipeline = CreatePipeline("NestedLoopPipeline");

        var node = new PipelineNode(Guid.NewGuid(), pipeline.Id, "ExportTool", "Tool", 0, 0);
        pipeline.AddNode(node);
        _graphProvider.Register(execId, pipeline);

        var root = new ScopeContext("root");
        var outerScope = root.BuildChildScope("char_loop", iterationIndex: 0);

        var innerScope0 = outerScope.BuildChildScope("tex_loop", iterationIndex: 0);
        innerScope0.SetValue("TextureName", "Diffuse_0.png");

        var innerScope1 = outerScope.BuildChildScope("tex_loop", iterationIndex: 1);
        innerScope1.SetValue("TextureName", "Normal_1.png");

        var res0 = await _resolver.ResolvePinAsync(execId, node.Id, "TextureName", innerScope0);
        var res1 = await _resolver.ResolvePinAsync(execId, node.Id, "TextureName", innerScope1);

        res0.Should().Be("Diffuse_0.png");
        res1.Should().Be("Normal_1.png");
    }

    // Helpers
    private static PipelineEntity CreatePipeline(string name)
    {
        return new PipelineEntity(Guid.NewGuid(), name);
    }

    private class FakePipelineGraphProvider : IPipelineGraphProvider
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

    private class FakeToolRegistry : IToolRegistry
    {
        private readonly List<IResolverTool> _tools =
        [
            new FakeAppendStringTool(),
        ];

        public IReadOnlyList<IResolverTool> GetAll() => _tools;
        public IResolverTool? GetByKey(string key) => _tools.FirstOrDefault(t => string.Equals(t.Key, key, StringComparison.OrdinalIgnoreCase));
    }

    private class FakeAppendStringTool : IResolverTool
    {
        public string Key => "AppendString";
        public string Label => "Append String";
        public bool IsPure => true;
        public IReadOnlyList<PinDefinition> Inputs => [];
        public IReadOnlyList<PinDefinition> Outputs => [new() { Id = "Result", PrimitiveType = PinPrimitiveType.String }];

        public Task<Dictionary<string, object>> ExecuteAsync(Dictionary<string, object> inputs, ToolExecutionContext context)
        {
            var prefix = inputs.GetValueOrDefault("Prefix")?.ToString() ?? "";
            var suffix = inputs.GetValueOrDefault("Suffix")?.ToString() ?? "";
            return Task.FromResult(new Dictionary<string, object>
            {
                ["Result"] = $"{prefix}Appended{suffix}"
            });
        }
    }
}
