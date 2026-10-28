using System.Data.Common;
using System.Text.Json;
using Automation.Pipeline.Domain.Entities;
using PipelineEntity = Automation.Pipeline.Domain.Entities.Pipeline;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
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
using Automation.Runner.Contracts;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Wolverine;
using Xunit;

namespace Automation.Pipeline.Tests;

public class SubPipelineSuspendResumeTests : IDisposable
{
    private readonly DbConnection _connection;
    private readonly PipelineDbContext _db;
    private readonly IExecutionMemoryStore _memoryStore = Substitute.For<IExecutionMemoryStore>();
    private readonly IExecutionStateStore _stateStore = Substitute.For<IExecutionStateStore>();
    private readonly IPipelineOrchestrator _orchestrator = Substitute.For<IPipelineOrchestrator>();
    private readonly ISubPipelineCompletionNotifier _notifier = Substitute.For<ISubPipelineCompletionNotifier>();
    private readonly IRunnerApi _runnerApi = Substitute.For<IRunnerApi>();
    private readonly IMessageBus _bus = Substitute.For<IMessageBus>();

    public SubPipelineSuspendResumeTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<PipelineDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new TestPipelineDbContext(options);
        _db.Database.EnsureCreated();
    }

    public void Dispose()
    {
        _connection.Dispose();
        _db.Dispose();
    }

    [Fact]
    public async Task SubPipelineCompletedHandler_WhenChildSucceeded_ShouldCompleteMacroNodeAndResumeParent()
    {
        // Arrange
        var parentPipeline = new PipelineEntity(Guid.NewGuid(), "Parent");
        var childPipeline = new PipelineEntity(Guid.NewGuid(), "Child");
        _db.Pipelines.AddRange(parentPipeline, childPipeline);

        var macroNodeId = Guid.NewGuid();
        var parentExec = new PipelineExecution(parentPipeline.Id);
        parentExec.Start();
        _db.PipelineExecutions.Add(parentExec);

        var childExec = new PipelineExecution(childPipeline.Id, parentExecutionId: parentExec.Id, triggeredByNodeId: macroNodeId);
        childExec.MarkSucceeded(JsonDocument.Parse("{\"parameters\":{\"outputs\":{\"result_path\":\"mesh.fbx\"}}}"));
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
            null
        );

        var message = new SubPipelineCompletedMessage(
            ParentExecutionId: parentExec.Id,
            ChildExecutionId: childExec.Id,
            ChildStatus: ExecutionStatus.Succeeded
        );

        // Act
        await handler.HandleAsync(message, CancellationToken.None);

        // Assert
        var updatedParent = await _db.PipelineExecutions.FindAsync(parentExec.Id);
        updatedParent.Should().NotBeNull();
        updatedParent!.CurrentBatchId.Should().BeNull();
        await _orchestrator.Received(1).ExecuteOrResumeAsync(parentExec.Id, ct: Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task SubPipelineCompletedHandler_WhenChildFailed_ShouldFailParentAndPropagate()
    {
        // Arrange
        var parentPipeline = new PipelineEntity(Guid.NewGuid(), "Parent");
        var childPipeline = new PipelineEntity(Guid.NewGuid(), "Child");
        _db.Pipelines.AddRange(parentPipeline, childPipeline);

        var macroNodeId = Guid.NewGuid();
        var parentExec = new PipelineExecution(parentPipeline.Id);
        parentExec.Start();
        _db.PipelineExecutions.Add(parentExec);

        var childExec = new PipelineExecution(childPipeline.Id, parentExecutionId: parentExec.Id, triggeredByNodeId: macroNodeId);
        childExec.MarkFailed("Blender runner crashed.");
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
            null
        );

        var message = new SubPipelineCompletedMessage(
            ParentExecutionId: parentExec.Id,
            ChildExecutionId: childExec.Id,
            ChildStatus: ExecutionStatus.Failed,
            ErrorMessage: "Blender runner crashed."
        );

        // Act
        await handler.HandleAsync(message, CancellationToken.None);

        // Assert
        var updatedParent = await _db.PipelineExecutions.FindAsync(parentExec.Id);
        updatedParent.Should().NotBeNull();
        updatedParent!.Status.Should().Be(ExecutionStatus.Failed);
        updatedParent.ErrorMessage.Should().Contain("Blender runner crashed");
        await _notifier.Received(1).NotifyIfChildAsync(updatedParent, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task SubPipelineCompletedHandler_WhenMismatchedChildId_ShouldBeIdempotentAndIgnore()
    {
        // Arrange
        var parentPipeline = new PipelineEntity(Guid.NewGuid(), "Parent");
        _db.Pipelines.Add(parentPipeline);

        var otherChildId = Guid.NewGuid();
        var parentExec = new PipelineExecution(parentPipeline.Id);
        parentExec.MarkWaitingForSubPipeline(otherChildId, nextIndex: 1, JsonDocument.Parse("{}"));
        _db.PipelineExecutions.Add(parentExec);
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
            null
        );

        var message = new SubPipelineCompletedMessage(
            ParentExecutionId: parentExec.Id,
            ChildExecutionId: Guid.NewGuid(), // different child
            ChildStatus: ExecutionStatus.Succeeded
        );

        // Act
        await handler.HandleAsync(message, CancellationToken.None);

        // Assert
        await _orchestrator.DidNotReceive().ExecuteOrResumeAsync(Arg.Any<Guid>(), ct: Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CancelPipelineExecution_WhenWaitingForSubPipeline_ShouldCascadeCancelToChild()
    {
        // Arrange
        var parentPipeline = new PipelineEntity(Guid.NewGuid(), "Parent");
        var childPipeline = new PipelineEntity(Guid.NewGuid(), "Child");
        _db.Pipelines.AddRange(parentPipeline, childPipeline);

        var parentExec = new PipelineExecution(parentPipeline.Id);
        var childExec = new PipelineExecution(childPipeline.Id, parentExecutionId: parentExec.Id);
        childExec.Start();
        childExec.MarkWaitingForRunner("batch-123", 1, JsonDocument.Parse("{}"));

        parentExec.MarkWaitingForSubPipeline(childExec.Id, 1, JsonDocument.Parse("{}"));
        _db.PipelineExecutions.AddRange(parentExec, childExec);
        await _db.SaveChangesAsync();

        var handler = new CancelPipelineExecutionHandler(_db, _runnerApi, null, _notifier);

        // Act
        var result = await handler.HandleAsync(new CancelPipelineExecutionCommand(parentExec.Id), CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        var updatedParent = await _db.PipelineExecutions.FindAsync(parentExec.Id);
        var updatedChild = await _db.PipelineExecutions.FindAsync(childExec.Id);

        updatedParent!.Status.Should().Be(ExecutionStatus.Cancelled);
        updatedChild!.Status.Should().Be(ExecutionStatus.Cancelled);
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

