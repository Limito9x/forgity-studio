using System.Text.Json;
using Automation.Files.Contracts;
using Automation.Pipeline.Contracts.Validation;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Hubs;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Runtime.Features.Execution;
using Automation.Pipeline.Runtime.Orchestrator;
using FluentAssertions;
using FluentResults;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Wolverine;
using Xunit;

namespace Automation.Pipeline.Tests;

public class RunPipelineTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly PipelineDbContext _db;
    private readonly IMessageBus _bus = Substitute.For<IMessageBus>();
    private readonly IAssetApi _assetApi = Substitute.For<IAssetApi>();
    private readonly IPipelineContractValidator _contractValidator = Substitute.For<IPipelineContractValidator>();
    private readonly IPipelineOrchestrator _orchestrator = Substitute.For<IPipelineOrchestrator>();
    private readonly IHubContext<PipelineExecutionHub> _hubContext = Substitute.For<IHubContext<PipelineExecutionHub>>();
    private readonly IHubClients _hubClients = Substitute.For<IHubClients>();
    private readonly IClientProxy _clientProxy = Substitute.For<IClientProxy>();

    public RunPipelineTests()
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

    public void Dispose()
    {
        _connection.Dispose();
        _db.Dispose();
    }

    [Fact]
    public async Task RunPipelineHandler_ValidPipeline_CreatesExecutionAndPublishesTriggerMessage()
    {
        // Arrange
        var pipeline = new Pipeline.Domain.Entities.Pipeline(Guid.NewGuid(), "Valid Pipeline");
        _db.Pipelines.Add(pipeline);
        await _db.SaveChangesAsync();

        _contractValidator.ValidateGraphAsync(Arg.Any<Pipeline.Domain.Entities.Pipeline>(), ct: Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(new PipelineContractValidationResult(true, [], [], [])));

        var handler = new RunPipelineHandler(_db, _bus, _assetApi, _contractValidator);
        var runtimeInputs = new Dictionary<string, object?> { ["count"] = 42 };
        var command = new RunPipelineCommand(pipeline.Id, runtimeInputs);

        // Act
        var result = await handler.HandleAsync(command, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        var executionId = result.Value.Id;
        result.Value.Status.Should().Be(ExecutionStatus.Pending);

        var dbExecution = await _db.PipelineExecutions.FirstOrDefaultAsync(x => x.Id == executionId);
        dbExecution.Should().NotBeNull();
        dbExecution!.Status.Should().Be(ExecutionStatus.Pending);

        await _bus.Received(1).PublishAsync(
            Arg.Is<TriggerPipelineExecutionMessage>(m =>
                m.ExecutionId == executionId &&
                m.RuntimeInputs != null &&
                m.RuntimeInputs["count"]!.ToString() == "42"
            )
        );
    }

    [Fact]
    public async Task TriggerPipelineExecutionHandler_OnMessageReceived_CallsOrchestrator()
    {
        // Arrange
        var pipeline = new Pipeline.Domain.Entities.Pipeline(Guid.NewGuid(), "Test Pipeline");
        _db.Pipelines.Add(pipeline);

        var execution = new PipelineExecution(pipeline.Id);
        _db.PipelineExecutions.Add(execution);
        await _db.SaveChangesAsync();

        _orchestrator.ExecuteOrResumeAsync(execution.Id, Arg.Any<Dictionary<string, object?>?>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(Result.Ok(execution)));

        var handler = new TriggerPipelineExecutionHandler(
            _orchestrator,
            _db,
            NullLogger<TriggerPipelineExecutionHandler>.Instance,
            _hubContext
        );

        var runtimeInputs = new Dictionary<string, object?> { ["param1"] = "val1" };
        var message = new TriggerPipelineExecutionMessage(execution.Id, runtimeInputs);

        // Act
        await handler.HandleAsync(message, CancellationToken.None);

        // Assert
        await _orchestrator.Received(1).ExecuteOrResumeAsync(execution.Id, runtimeInputs, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task TriggerPipelineExecutionHandler_OnOrchestratorFailure_MarksExecutionFailedAndBroadcastsSignalR()
    {
        // Arrange
        var pipeline = new Pipeline.Domain.Entities.Pipeline(Guid.NewGuid(), "Failing Pipeline");
        _db.Pipelines.Add(pipeline);

        var execution = new PipelineExecution(pipeline.Id);
        _db.PipelineExecutions.Add(execution);
        await _db.SaveChangesAsync();

        var failureError = "Step execution failed on runner node";
        _orchestrator.ExecuteOrResumeAsync(execution.Id, Arg.Any<Dictionary<string, object?>?>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(Result.Fail<PipelineExecution>(failureError)));

        var handler = new TriggerPipelineExecutionHandler(
            _orchestrator,
            _db,
            NullLogger<TriggerPipelineExecutionHandler>.Instance,
            _hubContext
        );

        var message = new TriggerPipelineExecutionMessage(execution.Id, null);

        // Act
        await handler.HandleAsync(message, CancellationToken.None);

        // Assert
        var updated = await _db.PipelineExecutions.FirstOrDefaultAsync(x => x.Id == execution.Id);
        updated.Should().NotBeNull();
        updated!.Status.Should().Be(ExecutionStatus.Failed);
        updated.ErrorMessage.Should().Contain(failureError);

        await _clientProxy.Received(1).SendCoreAsync(
            "PipelineExecutionFinished",
            Arg.Any<object?[]>(),
            Arg.Any<CancellationToken>()
        );
    }

    [Fact]
    public async Task TriggerPipelineExecutionHandler_OnUnexpectedException_HandlesGracefullyAndMarksFailed()
    {
        // Arrange
        var pipeline = new Pipeline.Domain.Entities.Pipeline(Guid.NewGuid(), "Crash Pipeline");
        _db.Pipelines.Add(pipeline);

        var execution = new PipelineExecution(pipeline.Id);
        _db.PipelineExecutions.Add(execution);
        await _db.SaveChangesAsync();

        _orchestrator.ExecuteOrResumeAsync(execution.Id, Arg.Any<Dictionary<string, object?>?>(), Arg.Any<CancellationToken>())
            .ThrowsAsync(new InvalidOperationException("RabbitMQ connection dropped unexpectedly"));

        var handler = new TriggerPipelineExecutionHandler(
            _orchestrator,
            _db,
            NullLogger<TriggerPipelineExecutionHandler>.Instance,
            _hubContext
        );

        var message = new TriggerPipelineExecutionMessage(execution.Id, null);

        // Act & Assert (Should not throw)
        var act = () => handler.HandleAsync(message, CancellationToken.None);
        await act.Should().NotThrowAsync();

        var updated = await _db.PipelineExecutions.FirstOrDefaultAsync(x => x.Id == execution.Id);
        updated.Should().NotBeNull();
        updated!.Status.Should().Be(ExecutionStatus.Failed);
        updated.ErrorMessage.Should().Contain("RabbitMQ connection dropped unexpectedly");

        await _clientProxy.Received(1).SendCoreAsync(
            "PipelineExecutionFinished",
            Arg.Any<object?[]>(),
            Arg.Any<CancellationToken>()
        );
    }

    [Fact]
    public void ValidatePipelineQuery_JsonDeserialization_DeserializesNodeKindsProperly()
    {
        // Arrange: Payload JSON từ Frontend chứa Tool, Container, Capsule dạng string enum (BL-011)
        var json = """
        {
            "pipelineId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
            "nodes": [
                {
                    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa7",
                    "refId": "FormatString",
                    "kind": "Tool",
                    "positionX": 100,
                    "positionY": 200
                },
                {
                    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa8",
                    "refId": "ScopeContainer",
                    "kind": "Container",
                    "positionX": 0,
                    "positionY": 0
                },
                {
                    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa9",
                    "refId": "Capsule",
                    "kind": "Capsule",
                    "positionX": 50,
                    "positionY": 50
                }
            ],
            "edges": []
        }
        """;

        var options = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        };

        // Act
        var query = JsonSerializer.Deserialize<ValidatePipelineQuery>(json, options);

        // Assert
        query.Should().NotBeNull();
        query!.Nodes.Should().HaveCount(3);
        query.Nodes![0].Kind.Should().Be(PipelineNodeKind.Tool);
        query.Nodes[1].Kind.Should().Be(PipelineNodeKind.Container);
        query.Nodes[2].Kind.Should().Be(PipelineNodeKind.Capsule);
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
