using System.Text.Json;
using Automation.Files.Contracts;
using Automation.Pipeline.Domain.Entities;
using PipelineEntity = Automation.Pipeline.Domain.Entities.Pipeline;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Runtime.Planner.Models;
using Automation.Pipeline.Runtime.Orchestrator.Dispatchers;
using Automation.Repository.Contracts;
using Automation.Runner.Contracts;
using FluentAssertions;
using FluentResults;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Wolverine;
using Xunit;

namespace Automation.Pipeline.Tests;

public class RunnerSegmentDispatcherTests
{
    private readonly IMessageBus _messageBus = Substitute.For<IMessageBus>();
    private readonly IRunnerApi _runnerApi = Substitute.For<IRunnerApi>();
    private readonly IAssetApi _assetApi = Substitute.For<IAssetApi>();
    private readonly IConfiguration _config = Substitute.For<IConfiguration>();

    [Fact]
    public async Task DispatchAsync_WhenNoRunnerSpecified_ShouldAutoResolveHoldingRunnerFromResourceInput()
    {
        // Arrange
        var resourceId = Guid.NewGuid();
        var holdingRunnerId = Guid.NewGuid();
        var repoApi = Substitute.For<IRepositoryApi>();
        repoApi.GetResourceLocationAsync(resourceId, Arg.Any<CancellationToken>())
            .Returns(Result.Ok(new ResourceLocationInfoDto(
                Guid.NewGuid(),
                resourceId,
                "Characters/Moonrise/Moonrise.fbx",
                "hash123",
                holdingRunnerId,
                "D:/Projects/DemoBlender"
            )));

        _runnerApi.GetExecutorConfigAsync(holdingRunnerId, "blender", Arg.Any<CancellationToken>())
            .Returns(Result.Ok(new RunnerExecutorConfigDto(
                Guid.NewGuid(),
                holdingRunnerId,
                "blender",
                "C:/Blender/blender.exe",
                "4.2",
                true,
                null,
                DateTimeOffset.UtcNow
            )));

        var dispatcher = new RunnerSegmentDispatcher(
            _messageBus,
            _runnerApi,
            _assetApi,
            _config,
            NullLogger<RunnerSegmentDispatcher>.Instance,
            repositoryApi: repoApi
        );

        var pipeline = new PipelineEntity(Guid.NewGuid(), "TestPipeline");
        var execution = new PipelineExecution(pipeline.Id);
        var state = new PipelineExecutionState();
        state.RuntimeInputs["input_resource"] = resourceId.ToString();
        execution.SetState(state.ToJsonDocument(), 0);

        var segment = new ExecSegment("blender", stageId: Guid.NewGuid(), stageName: "BlenderExport");

        // Act
        var result = await dispatcher.DispatchAsync(execution, segment, 1, []);

        // Assert
        result.IsSuccess.Should().BeTrue();
        await _runnerApi.Received(1).GetExecutorConfigAsync(holdingRunnerId, "blender", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task DispatchAsync_WhenNoResourceOrRunnerSpecified_ShouldAutoResolveFromSingleAttachedRepositoryRunner()
    {
        // Arrange
        var repoId = Guid.NewGuid();
        var singleRunnerId = Guid.NewGuid();
        var repoApi = Substitute.For<IRepositoryApi>();
        repoApi.GetAttachedRunnerIdsAsync(repoId, Arg.Any<CancellationToken>())
            .Returns(Result.Ok<IReadOnlyList<Guid>>([singleRunnerId]));

        _runnerApi.GetExecutorConfigAsync(singleRunnerId, "blender", Arg.Any<CancellationToken>())
            .Returns(Result.Ok(new RunnerExecutorConfigDto(
                Guid.NewGuid(),
                singleRunnerId,
                "blender",
                "C:/Blender/blender.exe",
                "4.2",
                true,
                null,
                DateTimeOffset.UtcNow
            )));

        var dispatcher = new RunnerSegmentDispatcher(
            _messageBus,
            _runnerApi,
            _assetApi,
            _config,
            NullLogger<RunnerSegmentDispatcher>.Instance,
            repositoryApi: repoApi
        );

        var pipeline = new PipelineEntity(Guid.NewGuid(), "TestPipeline");
        var execution = new PipelineExecution(pipeline.Id);
        var state = new PipelineExecutionState();
        state.RuntimeInputs["repository_id"] = repoId.ToString();
        execution.SetState(state.ToJsonDocument(), 0);

        var segment = new ExecSegment("blender", stageId: Guid.NewGuid(), stageName: "BlenderExport");

        // Act
        var result = await dispatcher.DispatchAsync(execution, segment, 1, []);

        // Assert
        result.IsSuccess.Should().BeTrue();
        await _runnerApi.Received(1).GetExecutorConfigAsync(singleRunnerId, "blender", Arg.Any<CancellationToken>());
    }
}
