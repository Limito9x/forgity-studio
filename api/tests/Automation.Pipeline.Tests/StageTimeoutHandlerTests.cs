using System.Text.Json;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Engine.Messages;
using Automation.Pipeline.Features.Pipelines.HandleAgentCallback;
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

public class StageTimeoutHandlerTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly PipelineDbContext _db;
    private readonly ILogger<StageTimeoutHandler> _logger = Substitute.For<ILogger<StageTimeoutHandler>>();
    private readonly IHubContext<PipelineExecutionHub> _hubContext = Substitute.For<IHubContext<PipelineExecutionHub>>();
    private readonly IHubClients _hubClients = Substitute.For<IHubClients>();
    private readonly IClientProxy _clientProxy = Substitute.For<IClientProxy>();

    private readonly StageTimeoutHandler _handler;

    public StageTimeoutHandlerTests()
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

        _handler = new StageTimeoutHandler(_db, _logger, _hubContext);
    }

    [Fact]
    public async Task HandleAsync_ExecutionStillWaitingWithMatchingBatchId_MarksFailedAndBroadcastsSignalR()
    {
        // Arrange
        var pipeline = new Pipeline.Domain.Entities.Pipeline(Guid.NewGuid(), "Timeout Test Pipeline");
        _db.Pipelines.Add(pipeline);

        var execution = new PipelineExecution(pipeline.Id)
        {
            Status = ExecutionStatus.WaitingForRunner,
            StartedAt = DateTimeOffset.UtcNow.AddMinutes(-31),
            CurrentBatchId = "batch-timedout-1"
        };
        _db.PipelineExecutions.Add(execution);
        await _db.SaveChangesAsync();

        var message = new StageTimeoutCheckMessage(execution.Id, "batch-timedout-1");

        // Act
        await _handler.HandleAsync(message, CancellationToken.None);

        // Assert
        var updated = await _db.PipelineExecutions.FirstAsync(x => x.Id == execution.Id);
        updated.Status.Should().Be(ExecutionStatus.Failed);
        updated.ErrorMessage.Should().Contain("within 30 minutes");

        // Verify SignalR broadcast: PipelineExecutionFinished sent with status failed
        await _clientProxy.Received(1).SendCoreAsync(
            "PipelineExecutionFinished",
            Arg.Any<object?[]>(),
            Arg.Any<CancellationToken>()
        );
    }

    [Fact]
    public async Task HandleAsync_ExecutionAlreadyCompleted_DoesNotChangeStatus()
    {
        // Arrange
        var pipeline = new Pipeline.Domain.Entities.Pipeline(Guid.NewGuid(), "Completed Pipeline");
        _db.Pipelines.Add(pipeline);

        var execution = new PipelineExecution(pipeline.Id)
        {
            Status = ExecutionStatus.Succeeded,
            StartedAt = DateTimeOffset.UtcNow.AddMinutes(-40),
            FinishedAt = DateTimeOffset.UtcNow.AddMinutes(-10),
            CurrentBatchId = null
        };
        _db.PipelineExecutions.Add(execution);
        await _db.SaveChangesAsync();

        var message = new StageTimeoutCheckMessage(execution.Id, "batch-old-1");

        // Act
        await _handler.HandleAsync(message, CancellationToken.None);

        // Assert
        var unchanged = await _db.PipelineExecutions.FirstAsync(x => x.Id == execution.Id);
        unchanged.Status.Should().Be(ExecutionStatus.Succeeded);
        unchanged.ErrorMessage.Should().BeNull();

        await _clientProxy.DidNotReceive().SendCoreAsync(Arg.Any<string>(), Arg.Any<object?[]>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task HandleAsync_CurrentBatchIdMismatched_DoesNothing()
    {
        // Arrange
        var pipeline = new Pipeline.Domain.Entities.Pipeline(Guid.NewGuid(), "Mismatched Batch Pipeline");
        _db.Pipelines.Add(pipeline);

        var execution = new PipelineExecution(pipeline.Id)
        {
            Status = ExecutionStatus.Running,
            StartedAt = DateTimeOffset.UtcNow.AddMinutes(-15),
            CurrentBatchId = "batch-new-2" // Active batch has moved on
        };
        _db.PipelineExecutions.Add(execution);
        await _db.SaveChangesAsync();

        var message = new StageTimeoutCheckMessage(execution.Id, "batch-old-1");

        // Act
        await _handler.HandleAsync(message, CancellationToken.None);

        // Assert
        var unchanged = await _db.PipelineExecutions.FirstAsync(x => x.Id == execution.Id);
        unchanged.Status.Should().Be(ExecutionStatus.Running);

        await _clientProxy.DidNotReceive().SendCoreAsync(Arg.Any<string>(), Arg.Any<object?[]>(), Arg.Any<CancellationToken>());
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
