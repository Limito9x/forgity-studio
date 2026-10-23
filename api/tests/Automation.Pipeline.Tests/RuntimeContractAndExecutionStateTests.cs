using System.Text.Json;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Contracts.NodeContract;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine;
using Automation.Pipeline.Engine.DataResolver;
using Automation.Pipeline.Engine.ExecPlanner;
using Automation.Pipeline.Engine.Messages;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Engine.Orchestrator;
using Automation.Pipeline.Engine.StructRegistry;
using Automation.Pipeline.Features.Pipelines;
using Automation.Pipeline.Features.Pipelines.HandleAgentCallback;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Infrastructure.Redis;
using Automation.Pipeline.Tools;
using FluentAssertions;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace Automation.Pipeline.Tests;

public class RuntimeContractAndExecutionStateTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly PipelineDbContext _db;
    private readonly IToolRegistry _toolRegistry;
    private readonly IEntityStructRegistry _structRegistry;
    private readonly IExecutionStateStore _stateStore;
    private readonly IExecutionMemoryStore _memoryStore;

    public RuntimeContractAndExecutionStateTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<PipelineDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new TestPipelineDbContext(options);
        _db.Database.EnsureCreated();

        _toolRegistry = Substitute.For<IToolRegistry>();
        _structRegistry = Substitute.For<IEntityStructRegistry>();
        _stateStore = new RedisExecutionStateStore(NullLogger<RedisExecutionStateStore>.Instance);
        _memoryStore = Substitute.For<IExecutionMemoryStore>();
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    [Fact]
    public void FrozenExecutionGraph_ContainsResolvedContracts_AndPureNodeIds()
    {
        // Arrange
        var projectId = Guid.NewGuid();
        var pipeline = new Domain.Entities.Pipeline(projectId, "Test");
        pipeline.AddNode("MakeStruct", "Tool", 0, 0);
        var pureNode = pipeline.Nodes.First();

        var dynamicInputs = new List<PinDefinition>
        {
            new() { Id = "Name", Label = "Name", Kind = PinKind.Data, PrimitiveType = PinPrimitiveType.String, IsRequired = true },
            new() { Id = "Age", Label = "Age", Kind = PinKind.Data, PrimitiveType = PinPrimitiveType.Number, IsRequired = false }
        };

        var resolvedContract = new ResolvedNodeContract(
            NodeId: pureNode.Id,
            RefId: "MakeStruct",
            Kind: PipelineNodeKind.Tool,
            Label: "Make Struct",
            DefinitionLabel: "Make Struct",
            Category: "Construct",
            Executor: "builtin",
            IsPure: true,
            IsFlowControl: false,
            SubPipelineId: null,
            NodeDefinitionId: null,
            Inputs: dynamicInputs,
            Outputs: [new PinDefinition { Id = "Struct", Kind = PinKind.Data, PrimitiveType = PinPrimitiveType.EntityRef, StructType = "MyStruct" }],
            ConfigValues: null,
            Metadata: null,
            IsDynamic: true
        );

        var contractsMap = new Dictionary<Guid, ResolvedNodeContract>
        {
            [pureNode.Id] = resolvedContract
        };

        // Act
        var graph = FrozenExecutionGraph.Create(
            pipeline,
            _toolRegistry,
            runtimeInputs: null,
            resolvedContracts: contractsMap
        );

        // Assert
        graph.ContractsByNodeId.Should().ContainKey(pureNode.Id);
        graph.ContractsByNodeId[pureNode.Id].Inputs.Should().HaveCount(2);
        graph.PureNodeIds.Should().Contain(pureNode.Id);
        graph.DynamicPureNodeIds.Should().Contain(pureNode.Id);
    }

    [Fact]
    public async Task StageResultConsumer_WhenStageFails_PersistsStepErrorsAndCapturesSnapshot()
    {
        // Arrange
        var projectId = Guid.NewGuid();
        var pipeline = new Domain.Entities.Pipeline(projectId, "StageFailTest");
        pipeline.AddNode("Step1", "Tool", 0, 0);
        pipeline.AddNode("Step2", "Custom", 100, 0);
        var node1 = pipeline.Nodes.First();
        var node2 = pipeline.Nodes.Last();
        _db.Pipelines.Add(pipeline);

        var execution = new PipelineExecution(pipeline.Id);
        execution.Start();
        _db.PipelineExecutions.Add(execution);
        await _db.SaveChangesAsync();

        var stageExecId = Guid.NewGuid();
        var mockOrchestrator = Substitute.For<IPipelineOrchestrator>();
        var fakeSnapshot = JsonDocument.Parse("{\"parameters\":{},\"nodeExecutions\":[{\"nodeId\":\"" + node2.Id + "\",\"status\":\"failed\",\"errorMessage\":\"Blender script crashed\"}]}");
        mockOrchestrator.CaptureExecutionStateSnapshotAsync(Arg.Any<PipelineExecution>(), Arg.Any<CancellationToken>())
            .Returns(fakeSnapshot);

        var consumer = new StageResultConsumer(
            _db,
            mockOrchestrator,
            _memoryStore,
            _stateStore,
            NullLogger<StageResultConsumer>.Instance,
            hubContext: null
        );

        var message = new StageResultMessage
        {
            PipelineExecutionId = execution.Id.ToString(),
            StageExecutionId = stageExecId.ToString(),
            Succeeded = false,
            ErrorMessage = "Subprocess exited with code 1",
            StepResults =
            [
                new()
                {
                    StepExecutionId = node1.Id.ToString(),
                    Succeeded = true,
                    Outputs = new Dictionary<string, object?> { ["out"] = 42 }
                },
                new()
                {
                    StepExecutionId = node2.Id.ToString(),
                    Succeeded = false,
                    ErrorMessage = "Blender script crashed",
                    Log = "Traceback (most recent call last)..."
                }
            ]
        };

        // Act
        await consumer.HandleAsync(message, CancellationToken.None);

        // Assert
        var updatedExec = await _db.PipelineExecutions.FindAsync(execution.Id);
        updatedExec.Should().NotBeNull();
        updatedExec!.Status.Should().Be(ExecutionStatus.Failed);
        updatedExec.ErrorMessage.Should().Be("Subprocess exited with code 1");
        updatedExec.ExecutionState.Should().NotBeNull();

        // Node error recorded in stateStore
        var node2Error = await _stateStore.GetNodeErrorAsync(execution.Id, node2.Id);
        node2Error.Should().Be("Blender script crashed");

        var node2Status = await _stateStore.GetNodeStatusAsync(execution.Id, node2.Id);
        node2Status.Should().Be("Failed");
    }

    [Fact]
    public async Task GetNodeExecutions_ReturnsErrorsFromSnapshot()
    {
        // Arrange
        var projectId = Guid.NewGuid();
        var pipeline = new Domain.Entities.Pipeline(projectId, "GetNodeExecTest");
        pipeline.AddNode("N1", "Tool", 0, 0);
        pipeline.AddNode("N2", "Tool", 100, 0);
        var node1Id = pipeline.Nodes.First().Id;
        var node2Id = pipeline.Nodes.Last().Id;
        _db.Pipelines.Add(pipeline);

        var execution = new PipelineExecution(pipeline.Id);
        var snapshot = JsonDocument.Parse($$"""
        {
            "nodeExecutions": [
                {
                    "nodeId": "{{node1Id}}",
                    "status": "Succeeded",
                    "output": { "val": 100 }
                },
                {
                    "nodeId": "{{node2Id}}",
                    "status": "Failed",
                    "errorMessage": "Invalid operation exception"
                }
            ]
        }
        """);
        execution.MarkFailed("Stage error", snapshot);
        _db.PipelineExecutions.Add(execution);
        await _db.SaveChangesAsync();

        var handler = new GetNodeExecutionsHandler(_db, _stateStore);
        var query = new GetNodeExecutionsQuery(execution.Id);

        // Act
        var result = await handler.HandleAsync(query, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().HaveCount(2);

        var node1Dto = result.Value.First(x => x.PipelineNodeId == node1Id);
        node1Dto.Status.Should().Be(ExecutionStatus.Succeeded);
        node1Dto.ErrorMessage.Should().BeNull();

        var node2Dto = result.Value.First(x => x.PipelineNodeId == node2Id);
        node2Dto.Status.Should().Be(ExecutionStatus.Failed);
        node2Dto.ErrorMessage.Should().Be("Invalid operation exception");
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
                        prop.SetColumnType("TEXT");
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
