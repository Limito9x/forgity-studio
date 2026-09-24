using System.Text.Json;
using Automation.Files.Contracts;
using Automation.Pipeline.Domain.Entities;
using PipelineEntity = Automation.Pipeline.Domain.Entities.Pipeline;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.DataResolver;
using Automation.Pipeline.Engine.DataResolver.Resolvers;
using Automation.Pipeline.Engine.ExecPlanner;
using Automation.Pipeline.Engine.Messages;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Engine.Orchestrator;
using Automation.Pipeline.Engine.Orchestrator.Dispatchers;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Infrastructure.Redis;
using Automation.Pipeline.Tools;
using Automation.Studio.Contracts;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Wolverine;
using Xunit;

namespace Automation.Pipeline.Tests;

public class PipelineOrchestratorTests
{
    private readonly PipelineDbContext _db;
    private readonly IExecutionMemoryStore _memoryStore = new RedisExecutionMemoryStore(NullLogger<RedisExecutionMemoryStore>.Instance);
    private readonly IExecPlanner _execPlanner = new ExecPlanner();
    private readonly FakeToolRegistry _toolRegistry = new();
    private readonly IMessageBus _messageBus = Substitute.For<IMessageBus>();
    private readonly IStudioApi _studioApi = Substitute.For<IStudioApi>();
    private readonly IAssetApi _assetApi = Substitute.For<IAssetApi>();
    private readonly PipelineOrchestrator _orchestrator;

    private readonly Microsoft.Data.Sqlite.SqliteConnection _connection;

    public PipelineOrchestratorTests()
    {
        _connection = new Microsoft.Data.Sqlite.SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<PipelineDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new TestPipelineDbContext(options);
        _db.Database.EnsureCreated();

        var graphProvider = new PipelineGraphProvider(_db);
        var assetResolver = new AssetResolver(_assetApi, NullLogger<AssetResolver>.Instance);
        var pureNodeResolver = new PureNodeResolver(_toolRegistry, _memoryStore, graphProvider, NullLogger<PureNodeResolver>.Instance);
        var pinResolver = new PinValueResolver(
            graphProvider,
            _memoryStore,
            _toolRegistry,
            pureNodeResolver,
            assetResolver,
            NullLogger<PinValueResolver>.Instance
        );

        var config = Substitute.For<IConfiguration>();
        var dotNetDispatcher = new DotNetSegmentDispatcher(_db, _toolRegistry, pinResolver, _memoryStore, NullLogger<DotNetSegmentDispatcher>.Instance);
        var agentDispatcher = new AgentSegmentDispatcher(_messageBus, _studioApi, _assetApi, config, NullLogger<AgentSegmentDispatcher>.Instance);
        var forEachDispatcher = new ForEachDispatcher(_db, pinResolver, _memoryStore, dotNetDispatcher, NullLogger<ForEachDispatcher>.Instance);

        _orchestrator = new PipelineOrchestrator(
            _db,
            _execPlanner,
            _memoryStore,
            dotNetDispatcher,
            agentDispatcher,
            forEachDispatcher,
            _toolRegistry,
            null,
            NullLogger<PipelineOrchestrator>.Instance
        );
    }

    [Fact]
    public async Task ExecuteOrResumeAsync_DotNetActionSequence_ShouldExecuteAndSucceed()
    {
        var pipeline = new PipelineEntity(Guid.NewGuid(), "DotNetPipeline");
        var startNode = new PipelineNode(Guid.NewGuid(), pipeline.Id, "Start", "Start", 0, 0);

        var toolConfig = JsonDocument.Parse("{\"Prefix\": \"User_\", \"Suffix\": \"_Avatar\"}");
        var actionNode = new PipelineNode(Guid.NewGuid(), pipeline.Id, "AppendAction", "Tool", 0, 0, toolConfig);

        pipeline.AddNode(startNode);
        pipeline.AddNode(actionNode);
        pipeline.AddEdge(startNode.Id, "exec_out", actionNode.Id, "exec_in");

        _db.Pipelines.Add(pipeline);

        var execution = new PipelineExecution(pipeline.Id, Guid.NewGuid());
        _db.PipelineExecutions.Add(execution);
        await _db.SaveChangesAsync();

        var result = await _orchestrator.ExecuteOrResumeAsync(execution.Id);

        result.IsSuccess.Should().BeTrue();
        execution.Status.Should().Be(ExecutionStatus.Succeeded);

        // Verify output saved in Memory Store
        var outputVal = await _memoryStore.GetNodePinValueAsync(execution.Id, actionNode.Id, "Result");
        outputVal.Should().Be("User_Appended_Avatar");
    }

    [Fact]
    public async Task ExecuteOrResumeAsync_WithForEach_ShouldIterateAndAggregateYields()
    {
        var pipeline = new PipelineEntity(Guid.NewGuid(), "ForEachPipeline");
        var startNode = new PipelineNode(Guid.NewGuid(), pipeline.Id, "Start", "Start", 0, 0);

        var forEachConfig = JsonDocument.Parse("{\"Collection\": [\"Mesh_A\", \"Mesh_B\"]}");
        var forEachNode = new PipelineNode(Guid.NewGuid(), pipeline.Id, "ForEach", "FlowControl", 0, 0, forEachConfig);

        // Body action: takes Item from scope and outputs formatted name
        var bodyActionNode = new PipelineNode(Guid.NewGuid(), pipeline.Id, "FormatItemAction", "Tool", 0, 0);

        pipeline.AddNode(startNode);
        pipeline.AddNode(forEachNode);
        pipeline.AddNode(bodyActionNode);

        pipeline.AddEdge(startNode.Id, "exec_out", forEachNode.Id, "exec_in");
        pipeline.AddEdge(forEachNode.Id, "loop_body", bodyActionNode.Id, "exec_in");

        // BodyAction.Result -> ForEach.YieldValue
        pipeline.AddEdge(bodyActionNode.Id, "Result", forEachNode.Id, "YieldValue");

        _db.Pipelines.Add(pipeline);

        var execution = new PipelineExecution(pipeline.Id, Guid.NewGuid());
        _db.PipelineExecutions.Add(execution);
        await _db.SaveChangesAsync();

        var result = await _orchestrator.ExecuteOrResumeAsync(execution.Id);

        result.IsSuccess.Should().BeTrue();
        execution.Status.Should().Be(ExecutionStatus.Succeeded);

        // Verify ResultArray and ResultMap in Memory Store
        var rawResultArray = await _memoryStore.GetNodePinValueAsync(execution.Id, forEachNode.Id, "ResultArray");
        rawResultArray.Should().NotBeNull();

        var rawResult = await _memoryStore.GetNodePinValueAsync(execution.Id, forEachNode.Id, "ResultMap");
        rawResult.Should().NotBeNull();
        var resultMap = rawResult is string jsonStr
            ? JsonSerializer.Deserialize<Dictionary<string, object?>>(jsonStr)
            : rawResult as Dictionary<string, object?>;

        resultMap.Should().NotBeNull();
        resultMap!.Should().HaveCount(2);
        resultMap["0"]?.ToString().Should().Be("Formatted_Mesh_A");
        resultMap["1"]?.ToString().Should().Be("Formatted_Mesh_B");
    }

    [Fact]
    public async Task ExecuteOrResumeAsync_WithAgentNode_ShouldPublishMessageAndMarkWaitingForAgent()
    {
        var pipeline = new PipelineEntity(Guid.NewGuid(), "AgentPipeline");
        var startNode = new PipelineNode(Guid.NewGuid(), pipeline.Id, "Start", "Start", 0, 0);
        var agentNode = new PipelineNode(Guid.NewGuid(), pipeline.Id, "custom_import", "Tool", 0, 0);

        pipeline.AddNode(startNode);
        pipeline.AddNode(agentNode);
        pipeline.AddEdge(startNode.Id, "exec_out", agentNode.Id, "exec_in");

        var customDef = new NodeDefinition(pipeline.ProjectId, "Import Mesh", "custom_import", "Import Mesh", "blender", [], []);
        _db.NodeDefinitions.Add(customDef);

        _db.Pipelines.Add(pipeline);

        var mockEndpoint = Substitute.For<IDestinationEndpoint>();
        _messageBus.EndpointFor(Arg.Any<Uri>()).Returns(mockEndpoint);

        var execution = new PipelineExecution(pipeline.Id, Guid.NewGuid());
        _db.PipelineExecutions.Add(execution);
        await _db.SaveChangesAsync();

        var result = await _orchestrator.ExecuteOrResumeAsync(execution.Id);

        result.IsSuccess.Should().BeTrue();
        execution.Status.Should().Be(ExecutionStatus.WaitingForAgent);

        // Verify Wolverine sent StageTaskMessage to agent endpoint
        await mockEndpoint.Received(1).SendAsync(Arg.Is<StageTaskMessage>(msg =>
            msg.Executor == "blender" &&
            msg.Steps.Count == 1 &&
            msg.Steps[0].ScriptPath == "custom_import"
        ));
    }

    [Fact]
    public async Task ExecuteOrResumeAsync_OnResume_ShouldPreserveExistingVariablesWithoutWipeout()
    {
        var pipeline = new PipelineEntity(Guid.NewGuid(), "ResumeVariablePipeline");
        pipeline.Variables =
        [
            new PipelineVariableDecl
            {
                Name = "File Maps",
                Type = PinPrimitiveType.String,
                Cardinality = PinCardinality.Map
            }
        ];

        var startNode = new PipelineNode(Guid.NewGuid(), pipeline.Id, "Start", "Start", 0, 0);
        var agentNode = new PipelineNode(Guid.NewGuid(), pipeline.Id, "custom_import", "Tool", 0, 0);
        var postActionNode = new PipelineNode(Guid.NewGuid(), pipeline.Id, "AppendAction", "Tool", 0, 0);

        pipeline.AddNode(startNode);
        pipeline.AddNode(agentNode);
        pipeline.AddNode(postActionNode);
        pipeline.AddEdge(startNode.Id, "exec_out", agentNode.Id, "exec_in");
        pipeline.AddEdge(agentNode.Id, "exec_out", postActionNode.Id, "exec_in");

        var customDef = new NodeDefinition(pipeline.ProjectId, "Import Mesh", "custom_import", "Import Mesh", "blender", [], []);
        _db.NodeDefinitions.Add(customDef);
        _db.Pipelines.Add(pipeline);

        var mockEndpoint = Substitute.For<IDestinationEndpoint>();
        _messageBus.EndpointFor(Arg.Any<Uri>()).Returns(mockEndpoint);

        var execution = new PipelineExecution(pipeline.Id, Guid.NewGuid());
        _db.PipelineExecutions.Add(execution);
        await _db.SaveChangesAsync();

        // 1. Initial run -> executes Start, enters AgentNode, pauses at WaitingForAgent
        var initialRes = await _orchestrator.ExecuteOrResumeAsync(execution.Id);
        initialRes.IsSuccess.Should().BeTrue();
        execution.Status.Should().Be(ExecutionStatus.WaitingForAgent);

        // Simulate earlier step having written to "File Maps"
        var simulatedMap = new Dictionary<string, object?>
        {
            ["item1"] = "path/to/item1.fbx",
            ["item2"] = "path/to/item2.fbx"
        };
        await _memoryStore.SetVariableAsync(execution.Id, "File Maps", simulatedMap);

        // 2. Resume execution (e.g. Agent callback completes segment #1, next segment is #2)
        execution.NextNodeIndex = 2;
        await _db.SaveChangesAsync();

        var resumeRes = await _orchestrator.ExecuteOrResumeAsync(execution.Id);
        resumeRes.IsSuccess.Should().BeTrue();
        execution.Status.Should().Be(ExecutionStatus.Succeeded);

        // Verify "File Maps" was NOT wiped out back to {}
        var storedVar = await _memoryStore.GetVariableAsync(execution.Id, "File Maps");
        storedVar.Should().NotBeNull();
        var map = storedVar as IDictionary<string, object?>;
        map.Should().NotBeNull();
        map["item1"]?.ToString().Should().Be("path/to/item1.fbx");
        map["item2"]?.ToString().Should().Be("path/to/item2.fbx");
    }

    private class FakeToolRegistry : IToolRegistry
    {
        private readonly List<IResolverTool> _tools =
        [
            new FakeAppendActionTool(),
            new FakeFormatItemTool(),
            new FakeForEachTool()
        ];

        public IReadOnlyList<IResolverTool> GetAll() => _tools;
        public IResolverTool? GetByKey(string key) => _tools.FirstOrDefault(t => string.Equals(t.Key, key, StringComparison.OrdinalIgnoreCase));
    }

    private class FakeAppendActionTool : IResolverTool
    {
        public string Key => "AppendAction";
        public string Label => "Append Action";
        public bool IsPure => false;
        public IReadOnlyList<PinDefinition> Inputs => [
            new() { Id = "Prefix", PrimitiveType = PinPrimitiveType.String, IsRequired = false },
            new() { Id = "Suffix", PrimitiveType = PinPrimitiveType.String, IsRequired = false }
        ];
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

    private class FakeFormatItemTool : IResolverTool
    {
        public string Key => "FormatItemAction";
        public string Label => "Format Item Action";
        public bool IsPure => false;
        public IReadOnlyList<PinDefinition> Inputs => [new() { Id = "Item", PrimitiveType = PinPrimitiveType.String }];
        public IReadOnlyList<PinDefinition> Outputs => [new() { Id = "Result", PrimitiveType = PinPrimitiveType.String }];

        public Task<Dictionary<string, object>> ExecuteAsync(Dictionary<string, object> inputs, ToolExecutionContext context)
        {
            var item = inputs.GetValueOrDefault("Item")?.ToString() ?? "";
            return Task.FromResult(new Dictionary<string, object>
            {
                ["Result"] = $"Formatted_{item}"
            });
        }
    }

    private class FakeForEachTool : IResolverTool
    {
        public string Key => "ForEach";
        public string Label => "For Each";
        public string? Category => "Flow Control";
        public bool IsPure => false;
        public IReadOnlyList<PinDefinition> Inputs => [new() { Id = "Collection", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Array }];
        public IReadOnlyList<PinDefinition> Outputs => [new() { Id = "ResultMap", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Map }];

        public Task<Dictionary<string, object>> ExecuteAsync(Dictionary<string, object> inputs, ToolExecutionContext context)
            => Task.FromResult(new Dictionary<string, object>());
    }

    private class TestPipelineDbContext(DbContextOptions<PipelineDbContext> options) : PipelineDbContext(options)
    {
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            foreach (var entityType in modelBuilder.Model.GetEntityTypes())
            {
                foreach (var prop in entityType.GetProperties())
                {
                    if (prop.ClrType == typeof(JsonDocument))
                    {
                        prop.SetValueConverter(new Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<JsonDocument?, string?>(
                            v => v != null ? v.RootElement.GetRawText() : null,
                            v => v != null ? JsonDocument.Parse(v, default) : null
                        ));
                    }
                }
            }
        }
    }
}
