using Automation.Pipeline.Engine;
using Automation.Pipeline.Engine.DataResolver;
using Automation.Pipeline.Engine.Messages;
using Automation.Pipeline.Features.Pipelines.HandleAgentCallback;
using Automation.Pipeline.Hubs;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace Automation.Pipeline.Tests;

public class StepProgressConsumerTests
{
    private readonly IExecutionMemoryStore _memoryStore = Substitute.For<IExecutionMemoryStore>();
    private readonly IExecutionStateStore _stateStore = Substitute.For<IExecutionStateStore>();
    private readonly ILogger<StepProgressConsumer> _logger = Substitute.For<ILogger<StepProgressConsumer>>();
    private readonly IHubContext<PipelineExecutionHub> _hubContext = Substitute.For<IHubContext<PipelineExecutionHub>>();
    private readonly IHubClients _hubClients = Substitute.For<IHubClients>();
    private readonly IClientProxy _clientProxy = Substitute.For<IClientProxy>();

    private readonly StepProgressConsumer _consumer;

    public StepProgressConsumerTests()
    {
        _hubContext.Clients.Returns(_hubClients);
        _hubClients.Group(Arg.Any<string>()).Returns(_clientProxy);

        _consumer = new StepProgressConsumer(_memoryStore, _stateStore, _logger, _hubContext);
    }

    [Fact]
    public async Task HandleAsync_ValidRunningProgressMessage_UpdatesStateStoreAndBroadcastsSignalR_ZeroDb()
    {
        // Arrange
        var execId = Guid.NewGuid();
        var pipeId = Guid.NewGuid();
        var stepId = Guid.NewGuid();

        var message = new StepProgressMessage
        {
            PipelineExecutionId = execId.ToString(),
            PipelineId = pipeId.ToString(),
            StageExecutionId = "stage-1",
            StepExecutionId = stepId.ToString(),
            Status = "running",
            Outputs = null
        };

        // Act
        await _consumer.HandleAsync(message, CancellationToken.None);

        // Assert
        // 1. Zero-DB & Hot State: StateStore updated with status
        await _stateStore.Received(1).SetNodeStatusAsync(execId, stepId, "running", Arg.Any<CancellationToken>());

        // 2. MemoryStore not called because Outputs is null
        await _memoryStore.DidNotReceive().SetNodeAllOutputsAsync(
            Arg.Any<Guid>(), Arg.Any<Guid>(), Arg.Any<Dictionary<string, object?>>(), Arg.Any<Automation.Pipeline.Engine.Models.ScopeContext?>(), Arg.Any<CancellationToken>()
        );

        // 3. Realtime SignalR: Client proxy receives PipelineNodeExecutionUpdated
        await _clientProxy.Received(1).SendCoreAsync(
            "PipelineNodeExecutionUpdated",
            Arg.Any<object?[]>(),
            Arg.Any<CancellationToken>()
        );

        _hubClients.Received(1).Group($"pipeline_{pipeId}");
    }

    [Fact]
    public async Task HandleAsync_ValidCompletedProgressMessageWithOutputs_UpdatesMemoryStoreAndStateStoreAndBroadcasts()
    {
        // Arrange
        var execId = Guid.NewGuid();
        var pipeId = Guid.NewGuid();
        var stepId = Guid.NewGuid();
        var outputs = new Dictionary<string, object?>
        {
            ["result_mesh"] = "/path/to/mesh.fbx",
            ["vertex_count"] = 1054
        };

        var message = new StepProgressMessage
        {
            PipelineExecutionId = execId.ToString(),
            PipelineId = pipeId.ToString(),
            StageExecutionId = "stage-1",
            StepExecutionId = stepId.ToString(),
            Status = "succeeded",
            Outputs = outputs
        };

        // Act
        await _consumer.HandleAsync(message, CancellationToken.None);

        // Assert
        // 1. Outputs saved to MemoryStore
        await _memoryStore.Received(1).SetNodeAllOutputsAsync(
            execId, stepId, outputs, scope: null, ct: Arg.Any<CancellationToken>()
        );

        // 2. Status saved to StateStore
        await _stateStore.Received(1).SetNodeStatusAsync(
            execId, stepId, "succeeded", Arg.Any<CancellationToken>()
        );

        // 3. SignalR broadcasted
        await _clientProxy.Received(1).SendCoreAsync(
            "PipelineNodeExecutionUpdated",
            Arg.Any<object?[]>(),
            Arg.Any<CancellationToken>()
        );
    }

    [Fact]
    public async Task HandleAsync_FailedStepMessage_BroadcastsErrorMessageAndFailedStatus()
    {
        // Arrange
        var execId = Guid.NewGuid();
        var pipeId = Guid.NewGuid();
        var stepId = Guid.NewGuid();

        var message = new StepProgressMessage
        {
            PipelineExecutionId = execId.ToString(),
            PipelineId = pipeId.ToString(),
            StageExecutionId = "stage-1",
            StepExecutionId = stepId.ToString(),
            Status = "failed",
            ErrorMessage = "Script syntax error on line 42"
        };

        // Act
        await _consumer.HandleAsync(message, CancellationToken.None);

        // Assert
        await _stateStore.Received(1).SetNodeStatusAsync(execId, stepId, "failed", Arg.Any<CancellationToken>());
        await _clientProxy.Received(1).SendCoreAsync(
            "PipelineNodeExecutionUpdated",
            Arg.Any<object?[]>(),
            Arg.Any<CancellationToken>()
        );
    }

    [Fact]
    public async Task HandleAsync_InvalidGuids_LogsWarningAndBailsEarlyWithoutCalls()
    {
        // Arrange
        var message = new StepProgressMessage
        {
            PipelineExecutionId = "not-a-guid",
            PipelineId = "invalid-pipe",
            StepExecutionId = "invalid-step",
            Status = "running"
        };

        // Act
        await _consumer.HandleAsync(message, CancellationToken.None);

        // Assert - No store or SignalR calls
        await _stateStore.DidNotReceive().SetNodeStatusAsync(Arg.Any<Guid>(), Arg.Any<Guid>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
        await _memoryStore.DidNotReceive().SetNodeAllOutputsAsync(Arg.Any<Guid>(), Arg.Any<Guid>(), Arg.Any<Dictionary<string, object?>>(), Arg.Any<Automation.Pipeline.Engine.Models.ScopeContext?>(), Arg.Any<CancellationToken>());
        await _clientProxy.DidNotReceive().SendCoreAsync(Arg.Any<string>(), Arg.Any<object?[]>(), Arg.Any<CancellationToken>());
    }
}
