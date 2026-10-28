using System.Data.Common;
using System.Text.Json;
using Automation.Pipeline.Domain.Entities;
using PipelineEntity = Automation.Pipeline.Domain.Entities.Pipeline;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Hubs;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Runtime.Features.Execution;
using Automation.Pipeline.Runtime.Features.Execution.HandleAgentCallback;
using Automation.Pipeline.Runtime.Orchestrator;
using Automation.Pipeline.Runtime.Orchestrator.Dispatchers;
using Automation.Pipeline.Runtime.Orchestrator.SubPipeline;
using Automation.Pipeline.Runtime.Planner;
using Automation.Pipeline.Runtime.Planner.Models;
using Automation.Pipeline.Runtime.State.Messages;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace Automation.Pipeline.Tests;

public class SubPipelineErrorHandlingAndLengthTests : IDisposable
{
    private readonly DbConnection _connection;
    private readonly PipelineDbContext _db;
    private readonly IExecutionMemoryStore _memoryStore = Substitute.For<IExecutionMemoryStore>();
    private readonly IExecutionStateStore _stateStore = Substitute.For<IExecutionStateStore>();
    private readonly IPipelineOrchestrator _orchestrator = Substitute.For<IPipelineOrchestrator>();
    private readonly ISubPipelineCompletionNotifier _notifier = Substitute.For<ISubPipelineCompletionNotifier>();
    private readonly IHubContext<PipelineExecutionHub> _hubContext = Substitute.For<IHubContext<PipelineExecutionHub>>();
    private readonly IHubClients _hubClients = Substitute.For<IHubClients>();
    private readonly IClientProxy _clientProxy = Substitute.For<IClientProxy>();

    public SubPipelineErrorHandlingAndLengthTests()
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
        _hubClients.All.Returns(_clientProxy);
    }

    public void Dispose()
    {
        _connection.Dispose();
        _db.Dispose();
    }

    [Fact]
    public void PipelineExecution_MarkFailed_WithLongErrorMessage_ShouldTruncateToSafeLimit()
    {
        // Arrange
        var execution = new PipelineExecution(Guid.NewGuid());
        var hugeError = new string('X', 50_000);

        // Act
        execution.MarkFailed(hugeError);

        // Assert: 32 KB safety cap
        execution.Status.Should().Be(ExecutionStatus.Failed);
        execution.ErrorMessage.Should().NotBeNull();
        execution.ErrorMessage!.Length.Should().BeLessThanOrEqualTo(32768);
        execution.ErrorMessage.Should().Contain("[truncated]");

        // Act 2: Truncate down to 1900 for legacy varchar(2000) safety fallback
        execution.TruncateErrorMessage(1900);
        execution.ErrorMessage!.Length.Should().BeLessThanOrEqualTo(1900);
        execution.ErrorMessage.Should().EndWith("... [truncated]");
    }

    [Fact]
    public async Task StageResultConsumer_WhenStageFailsWithLongError_ShouldSaveErrorAndNotifySubPipeline()
    {
        // Arrange
        var pipeline = new PipelineEntity(Guid.NewGuid(), "Child Pipeline");
        _db.Pipelines.Add(pipeline);

        var parentExec = new PipelineExecution(pipeline.Id);
        parentExec.Start();
        _db.PipelineExecutions.Add(parentExec);
        await _db.SaveChangesAsync();

        var execution = new PipelineExecution(pipeline.Id, parentExecutionId: parentExec.Id);
        execution.Start();
        execution.MarkWaitingForRunner("batch-err-999", 0, JsonDocument.Parse("{}"));
        _db.PipelineExecutions.Add(execution);
        await _db.SaveChangesAsync();

        var longTraceback = "Traceback (most recent call last):\n" + new string('A', 8000) + "\nRuntimeError: Out of memory";

        var consumer = new StageResultConsumer(
            _db,
            _orchestrator,
            _memoryStore,
            _stateStore,
            NullLogger<StageResultConsumer>.Instance,
            _hubContext,
            _notifier
        );

        var message = new StageResultMessage
        {
            PipelineExecutionId = execution.Id.ToString(),
            StageExecutionId = "batch-err-999",
            Succeeded = false,
            ErrorMessage = longTraceback
        };

        // Act
        await consumer.HandleAsync(message, CancellationToken.None);

        // Assert
        var updated = await _db.PipelineExecutions.FindAsync(execution.Id);
        updated.Should().NotBeNull();
        updated!.Status.Should().Be(ExecutionStatus.Failed);
        updated.ErrorMessage.Should().NotBeNullOrEmpty();
        updated.ErrorMessage.Should().Contain("Traceback");

        // Verify child notification triggered so parent pipeline doesn't hang!
        await _notifier.Received(1).NotifyIfChildAsync(
            Arg.Is<PipelineExecution>(e => e.Id == execution.Id && e.Status == ExecutionStatus.Failed),
            Arg.Any<CancellationToken>()
        );

        // Verify SignalR broadcast
        await _clientProxy.Received(1).SendCoreAsync(
            "PipelineExecutionFinished",
            Arg.Any<object?[]>(),
            Arg.Any<CancellationToken>()
        );
    }

    [Fact]
    public async Task SubPipelineCompletedHandler_WhenChildFailsWithLongError_ShouldFailParentAndPropagateError()
    {
        // Arrange
        var grandParentPipeline = new PipelineEntity(Guid.NewGuid(), "GrandParent");
        var parentPipeline = new PipelineEntity(Guid.NewGuid(), "Parent");
        var childPipeline = new PipelineEntity(Guid.NewGuid(), "Child");
        _db.Pipelines.AddRange(grandParentPipeline, parentPipeline, childPipeline);

        var grandParentExec = new PipelineExecution(grandParentPipeline.Id);
        grandParentExec.Start();
        _db.PipelineExecutions.Add(grandParentExec);
        await _db.SaveChangesAsync();

        var parentExec = new PipelineExecution(parentPipeline.Id, parentExecutionId: grandParentExec.Id);
        parentExec.Start();
        _db.PipelineExecutions.Add(parentExec);
        await _db.SaveChangesAsync();

        var childExec = new PipelineExecution(childPipeline.Id, parentExecutionId: parentExec.Id);
        var longChildError = "Subpipeline Blender script crashed with detailed stack:\n" + new string('B', 6000);
        childExec.MarkFailed(longChildError);
        _db.PipelineExecutions.Add(childExec);

        parentExec.MarkWaitingForSubPipeline(childExec.Id, nextIndex: 1, JsonDocument.Parse("{}"));
        await _db.SaveChangesAsync();

        var subDispatcher = Substitute.ForPartsOf<SubPipelineDispatcher>(
            _db,
            Substitute.For<IPinValueResolver>(),
            _memoryStore,
            _stateStore,
            NullLogger<SubPipelineDispatcher>.Instance,
            null
        );

        var handler = new SubPipelineCompletedHandler(
            _db,
            _orchestrator,
            subDispatcher,
            _notifier,
            NullLogger<SubPipelineCompletedHandler>.Instance,
            _hubContext
        );

        var message = new SubPipelineCompletedMessage(
            ParentExecutionId: parentExec.Id,
            ChildExecutionId: childExec.Id,
            ChildStatus: ExecutionStatus.Failed,
            ErrorMessage: longChildError
        );

        // Act
        await handler.HandleAsync(message, CancellationToken.None);

        // Assert
        var updatedParent = await _db.PipelineExecutions.FindAsync(parentExec.Id);
        updatedParent.Should().NotBeNull();
        updatedParent!.Status.Should().Be(ExecutionStatus.Failed);
        updatedParent.ErrorMessage.Should().Contain("Subpipeline Blender script crashed");

        // Verify grand-parent propagation
        await _notifier.Received(1).NotifyIfChildAsync(
            Arg.Is<PipelineExecution>(e => e.Id == parentExec.Id && e.Status == ExecutionStatus.Failed),
            Arg.Any<CancellationToken>()
        );

        // Verify SignalR broadcast
        await _clientProxy.Received(1).SendCoreAsync(
            "PipelineExecutionFinished",
            Arg.Any<object?[]>(),
            Arg.Any<CancellationToken>()
        );
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
