using System.Text.Json;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Runtime.DataResolver;
using Automation.Pipeline.Runtime.State.Messages;
using Automation.Pipeline.Runtime.Planner.Models;
using Automation.Pipeline.Runtime.Orchestrator;
using Automation.Pipeline.Runtime.Features.Execution.HandleAgentCallback;
using Automation.Pipeline.Hubs;
using Automation.Pipeline.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace Automation.Pipeline.Tests;

public class StageResultConsumerTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly PipelineDbContext _db;
    private readonly IPipelineOrchestrator _orchestrator = Substitute.For<IPipelineOrchestrator>();
    private readonly IExecutionMemoryStore _memoryStore = Substitute.For<IExecutionMemoryStore>();
    private readonly IExecutionStateStore _stateStore = Substitute.For<IExecutionStateStore>();
    private readonly ILogger<StageResultConsumer> _logger = Substitute.For<ILogger<StageResultConsumer>>();
    private readonly IHubContext<PipelineExecutionHub> _hubContext = Substitute.For<IHubContext<PipelineExecutionHub>>();
    private readonly IHubClients _hubClients = Substitute.For<IHubClients>();
    private readonly IClientProxy _clientProxy = Substitute.For<IClientProxy>();

    private readonly StageResultConsumer _consumer;

    public StageResultConsumerTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<PipelineDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new TestPipelineDbContext(options);
        _db.Database.EnsureCreated();

        _hubContext.Clients.Returns(_hubClients);
        _hubClients.Group(Arg.Any<string>()).Returns(_clientProxy);

        _consumer = new StageResultConsumer(_db, _orchestrator, _memoryStore, _stateStore, _logger, _hubContext);
    }

    [Fact]
    public async Task HandleAsync_StageFailed_MarksExecutionFailed_SavesDb_AndBroadcastsFinishedSignalR()
    {
        // Arrange
        var pipeline = new Pipeline.Domain.Entities.Pipeline(Guid.NewGuid(), "Fail Test Pipeline");
        _db.Pipelines.Add(pipeline);

        var execution = new PipelineExecution(pipeline.Id)
        {
            Status = ExecutionStatus.WaitingForRunner,
            StartedAt = DateTimeOffset.UtcNow.AddMinutes(-1),
            CurrentBatchId = "batch-fail-1"
        };
        _db.PipelineExecutions.Add(execution);
        await _db.SaveChangesAsync();

        var message = new StageResultMessage
        {
            PipelineExecutionId = execution.Id.ToString(),
            PipelineId = pipeline.Id.ToString(),
            StageExecutionId = "batch-fail-1",
            Succeeded = false,
            ErrorMessage = "Subprocess killed due to step error"
        };

        // Act
        await _consumer.HandleAsync(message, CancellationToken.None);

        // Assert
        var updated = await _db.PipelineExecutions.FirstAsync(x => x.Id == execution.Id);
        updated.Status.Should().Be(ExecutionStatus.Failed);
        updated.ErrorMessage.Should().Be("Subprocess killed due to step error");

        // Verify SignalR broadcast: PipelineExecutionFinished sent with status failed
        await _clientProxy.Received(1).SendCoreAsync(
            "PipelineExecutionFinished",
            Arg.Any<object?[]>(),
            Arg.Any<CancellationToken>()
        );

        // Verify orchestrator NOT resumed on failure
        await _orchestrator.DidNotReceive().ExecuteOrResumeAsync(
            Arg.Any<Guid>(), Arg.Any<Dictionary<string, object?>?>(), Arg.Any<CancellationToken>()
        );
    }

    [Fact]
    public async Task HandleAsync_StageSucceeded_HydratesState_ResumesOrchestrator_AndBroadcastsSteps()
    {
        // Arrange
        var pipeline = new Pipeline.Domain.Entities.Pipeline(Guid.NewGuid(), "Success Test Pipeline");
        _db.Pipelines.Add(pipeline);

        var stepNodeId = Guid.NewGuid();
        var emptyState = new PipelineExecutionState();
        var stateJson = emptyState.ToJsonDocument();

        var execution = new PipelineExecution(pipeline.Id)
        {
            Status = ExecutionStatus.WaitingForRunner,
            StartedAt = DateTimeOffset.UtcNow.AddMinutes(-2),
            CurrentBatchId = "batch-success-1",
            ExecutionState = stateJson,
            NextNodeIndex = 1
        };
        _db.PipelineExecutions.Add(execution);
        await _db.SaveChangesAsync();

        var stepOutputs = new Dictionary<string, object?>
        {
            ["asset_path"] = "output/model.blend"
        };

        var message = new StageResultMessage
        {
            PipelineExecutionId = execution.Id.ToString(),
            PipelineId = pipeline.Id.ToString(),
            StageExecutionId = "batch-success-1",
            Succeeded = true,
            StepResults = new List<StepResult>
            {
                new()
                {
                    StepExecutionId = stepNodeId.ToString(),
                    Succeeded = true,
                    Outputs = stepOutputs,
                    Log = "Step finished successfully"
                }
            }
        };

        // Act
        await _consumer.HandleAsync(message, CancellationToken.None);

        // Assert
        // 1. StateStore and MemoryStore received step outputs
        await _stateStore.Received(1).SetNodeOutputsAsync(execution.Id, stepNodeId, stepOutputs, Arg.Any<CancellationToken>());
        await _memoryStore.Received(1).SetNodeAllOutputsAsync(execution.Id, stepNodeId, stepOutputs, scope: null, ct: Arg.Any<CancellationToken>());

        // 2. Realtime SignalR broadcasted for node update
        await _clientProxy.Received(1).SendCoreAsync(
            "PipelineNodeExecutionUpdated",
            Arg.Any<object?[]>(),
            Arg.Any<CancellationToken>()
        );

        // 3. Orchestrator resumed
        await _orchestrator.Received(1).ExecuteOrResumeAsync(execution.Id, Arg.Any<Dictionary<string, object?>?>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task HandleAsync_ExecutionAlreadyTerminal_SkipsCallback()
    {
        // Arrange
        var pipeline = new Pipeline.Domain.Entities.Pipeline(Guid.NewGuid(), "Cancelled Pipeline");
        _db.Pipelines.Add(pipeline);

        var execution = new PipelineExecution(pipeline.Id)
        {
            Status = ExecutionStatus.Cancelled,
            StartedAt = DateTimeOffset.UtcNow.AddMinutes(-5),
            FinishedAt = DateTimeOffset.UtcNow.AddMinutes(-1),
            CurrentBatchId = "batch-cancelled-1"
        };
        _db.PipelineExecutions.Add(execution);
        await _db.SaveChangesAsync();

        var message = new StageResultMessage
        {
            PipelineExecutionId = execution.Id.ToString(),
            PipelineId = pipeline.Id.ToString(),
            StageExecutionId = "batch-cancelled-1",
            Succeeded = true
        };

        // Act
        await _consumer.HandleAsync(message, CancellationToken.None);

        // Assert: No DB modification, no SignalR, no orchestrator resumption
        var unchanged = await _db.PipelineExecutions.FirstAsync(x => x.Id == execution.Id);
        unchanged.Status.Should().Be(ExecutionStatus.Cancelled);

        await _clientProxy.DidNotReceive().SendCoreAsync(Arg.Any<string>(), Arg.Any<object?[]>(), Arg.Any<CancellationToken>());
        await _orchestrator.DidNotReceive().ExecuteOrResumeAsync(Arg.Any<Guid>(), Arg.Any<Dictionary<string, object?>?>(), Arg.Any<CancellationToken>());
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
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
