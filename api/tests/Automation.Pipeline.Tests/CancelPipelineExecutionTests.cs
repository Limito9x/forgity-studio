using System.Text.Json;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Features.Pipelines;
using Automation.Pipeline.Hubs;
using Automation.Pipeline.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace Automation.Pipeline.Tests;

public class CancelPipelineExecutionTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly PipelineDbContext _db;
    private readonly IHubContext<PipelineExecutionHub> _hubContext = Substitute.For<IHubContext<PipelineExecutionHub>>();
    private readonly IHubClients _hubClients = Substitute.For<IHubClients>();
    private readonly IClientProxy _clientProxy = Substitute.For<IClientProxy>();

    public CancelPipelineExecutionTests()
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
    }

    [Fact]
    public async Task Cancel_RunningExecution_SetsStatusToCancelledAndSetsFinishedAt()
    {
        // Arrange
        var pipeline = new Pipeline.Domain.Entities.Pipeline(Guid.NewGuid(), "Test Pipeline");
        _db.Pipelines.Add(pipeline);

        var execution = new PipelineExecution(pipeline.Id)
        {
            Status = ExecutionStatus.Running,
            StartedAt = DateTimeOffset.UtcNow.AddMinutes(-5)
        };
        _db.PipelineExecutions.Add(execution);
        await _db.SaveChangesAsync();

        var handler = new CancelPipelineExecutionHandler(_db, _hubContext);

        // Act
        var result = await handler.HandleAsync(new CancelPipelineExecutionCommand(execution.Id), CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Status.Should().Be(ExecutionStatus.Cancelled);
        result.Value.FinishedAt.Should().NotBeNull();

        var updated = await _db.PipelineExecutions.FirstAsync(x => x.Id == execution.Id);
        updated.Status.Should().Be(ExecutionStatus.Cancelled);
        updated.FinishedAt.Should().NotBeNull();

        // Verify SignalR broadcast
        await _clientProxy.Received(1).SendCoreAsync(
            "PipelineExecutionFinished",
            Arg.Any<object?[]>(),
            Arg.Any<CancellationToken>()
        );
    }

    [Fact]
    public async Task Cancel_AlreadySucceededExecution_ReturnsOkWithoutChangingStatus()
    {
        // Arrange
        var pipeline = new Pipeline.Domain.Entities.Pipeline(Guid.NewGuid(), "Test Pipeline");
        _db.Pipelines.Add(pipeline);

        var finishedTime = DateTimeOffset.UtcNow.AddMinutes(-2);
        var execution = new PipelineExecution(pipeline.Id)
        {
            Status = ExecutionStatus.Succeeded,
            StartedAt = DateTimeOffset.UtcNow.AddMinutes(-5),
            FinishedAt = finishedTime
        };
        _db.PipelineExecutions.Add(execution);
        await _db.SaveChangesAsync();

        var handler = new CancelPipelineExecutionHandler(_db, _hubContext);

        // Act
        var result = await handler.HandleAsync(new CancelPipelineExecutionCommand(execution.Id), CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Status.Should().Be(ExecutionStatus.Succeeded);
        result.Value.FinishedAt.Should().Be(finishedTime);

        // No SignalR broadcast needed for already completed
        await _clientProxy.DidNotReceive().SendCoreAsync(
            "PipelineExecutionFinished",
            Arg.Any<object?[]>(),
            Arg.Any<CancellationToken>()
        );
    }

    [Fact]
    public async Task Cancel_NonExistentExecution_ReturnsFailure()
    {
        // Arrange
        var handler = new CancelPipelineExecutionHandler(_db, _hubContext);

        // Act
        var result = await handler.HandleAsync(new CancelPipelineExecutionCommand(Guid.NewGuid()), CancellationToken.None);

        // Assert
        result.IsFailed.Should().BeTrue();
        result.Errors.Should().ContainSingle(e => e.Message.Contains("not found"));
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
