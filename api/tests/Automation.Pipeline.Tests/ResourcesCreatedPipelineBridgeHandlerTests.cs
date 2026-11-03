using System.Text.Json;
using Automation.Pipeline.BuildTime.Features.Authoring.Dtos;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Runtime.Features.Execution.EventBridge;
using Automation.Repository.Contracts;
using FluentAssertions;
using FluentResults;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Wolverine;
using Xunit;

namespace Automation.Pipeline.Tests;

public class ResourcesCreatedPipelineBridgeHandlerTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly PipelineDbContext _db;
    private readonly IMessageBus _bus = Substitute.For<IMessageBus>();
    private readonly ResourcesCreatedPipelineBridgeHandler _handler;

    public ResourcesCreatedPipelineBridgeHandlerTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<PipelineDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new TestPipelineDbContext(options);
        _db.Database.EnsureCreated();

        _handler = new ResourcesCreatedPipelineBridgeHandler(
            _db,
            _bus,
            NullLogger<ResourcesCreatedPipelineBridgeHandler>.Instance
        );
    }

    public void Dispose()
    {
        _connection.Dispose();
        _db.Dispose();
    }

    [Fact]
    public async Task Handle_WithMultipleMatchedResources_ShouldEnqueueIndividualRunPipelineCommandForEachResource()
    {
        // Arrange: 1 Pipeline lắng nghe repoId cụ thể với file .blend
        var projectId = Guid.NewGuid();
        var repoId = Guid.NewGuid();
        var wsId = Guid.NewGuid();

        var configJson = JsonSerializer.SerializeToDocument(new
        {
            repositoryIds = new[] { repoId },
            extensions = new[] { "blend" }
        });

        var pipeline = new Domain.Entities.Pipeline(
            projectId,
            "Blender Batch Pipeline",
            PipelineTriggerType.OnResourceCreated,
            configJson
        );
        _db.Pipelines.Add(pipeline);
        await _db.SaveChangesAsync();

        var v1 = Guid.NewGuid();
        var v2 = Guid.NewGuid();
        var v3 = Guid.NewGuid();

        var message = new ResourcesCreatedEvent(
            projectId,
            repoId,
            Guid.NewGuid(),
            new List<ResourceVersionCreatedInfo>
            {
                new(v1, ".blend", null, "Characters/Eva.blend"),
                new(v2, "blend", null, "Characters/Chris.blend"),
                new(v3, ".fbx", null, "Characters/Ignored.fbx") // file fbx không khớp extension
            },
            WorkstationId: wsId
        );

        _bus.InvokeAsync<Result<PipelineExecutionDto>>(Arg.Any<RunPipelineCommand>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(Result.Ok(new PipelineExecutionDto(Guid.NewGuid(), pipeline.Id, ExecutionStatus.Pending, null, null, null, 0, null, null))));

        // Act
        await _handler.Handle(message, CancellationToken.None);

        // Assert: 2 file .blend phải sinh ra đúng 2 lệnh RunPipelineCommand độc lập trong queue
        var calls = _bus.ReceivedCalls()
            .Where(c => c.GetMethodInfo().Name == nameof(IMessageBus.InvokeAsync))
            .Select(c => c.GetArguments()[0] as RunPipelineCommand)
            .Where(cmd => cmd != null && cmd.PipelineId == pipeline.Id)
            .ToList();

        calls.Should().HaveCount(2);

        // Call 1: kiểm tra cả chân Resource (Single) và Resources (Array 1 item) + Workstation
        var cmd1 = calls![0]!;
        cmd1.IsEventTrigger.Should().BeTrue();
        cmd1.RuntimeInputs!["Resource"].Should().Be($"resource:{v1}");
        var resArray1 = cmd1.RuntimeInputs!["Resources"] as List<string>;
        resArray1.Should().ContainSingle().Which.Should().Be($"resource:{v1}");
        cmd1.RuntimeInputs!["Workstation"].Should().Be($"workstation:{wsId}");

        // Call 2:
        var cmd2 = calls![1]!;
        cmd2.RuntimeInputs!["Resource"].Should().Be($"resource:{v2}");
        var resArray2 = cmd2.RuntimeInputs!["Resources"] as List<string>;
        resArray2.Should().ContainSingle().Which.Should().Be($"resource:{v2}");
    }

    [Fact]
    public async Task Handle_WithMultiRepositoryConfig_ShouldTriggerOnlyForMatchedRepositories()
    {
        // Arrange: Pipeline lắng nghe [repoA, repoB]
        var projectId = Guid.NewGuid();
        var repoA = Guid.NewGuid();
        var repoB = Guid.NewGuid();
        var repoC = Guid.NewGuid();

        var configJson = JsonSerializer.SerializeToDocument(new
        {
            repositoryIds = new[] { repoA, repoB },
            extensions = new[] { "fbx" }
        });

        var pipeline = new Domain.Entities.Pipeline(
            projectId,
            "Multi Repo Pipeline",
            PipelineTriggerType.OnResourceCreated,
            configJson
        );
        _db.Pipelines.Add(pipeline);
        await _db.SaveChangesAsync();

        var v1 = Guid.NewGuid();

        // 1. Sự kiện phát từ repoC (không thuộc danh sách)
        var msgRepoC = new ResourcesCreatedEvent(
            projectId,
            repoC,
            Guid.NewGuid(),
            new List<ResourceVersionCreatedInfo> { new(v1, ".fbx", null, "file.fbx") }
        );
        await _handler.Handle(msgRepoC, CancellationToken.None);

        await _bus.DidNotReceiveWithAnyArgs().InvokeAsync<Result<PipelineExecutionDto>>(default!);

        // 2. Sự kiện phát từ repoB (thuộc danh sách)
        var msgRepoB = new ResourcesCreatedEvent(
            projectId,
            repoB,
            Guid.NewGuid(),
            new List<ResourceVersionCreatedInfo> { new(v1, ".fbx", null, "file.fbx") }
        );
        await _handler.Handle(msgRepoB, CancellationToken.None);

        await _bus.Received(1).InvokeAsync<Result<PipelineExecutionDto>>(
            Arg.Is<RunPipelineCommand>(c => c.PipelineId == pipeline.Id),
            Arg.Any<CancellationToken>()
        );
    }

    [Fact]
    public async Task Handle_WithEmptyRepositoriesAndAllowAllFalse_ShouldNotTrigger()
    {
        // Arrange: Pipeline chỉ nhập extensions: ["fbx"], nhưng repositoryIds rỗng và allowAllRepositories: false
        var projectId = Guid.NewGuid();
        var configJson = JsonSerializer.SerializeToDocument(new
        {
            allowAllRepositories = false,
            repositoryIds = Array.Empty<Guid>(),
            extensions = new[] { "fbx" }
        });

        var pipeline = new Domain.Entities.Pipeline(
            projectId,
            "Safe Guard Pipeline",
            PipelineTriggerType.OnResourceCreated,
            configJson
        );
        _db.Pipelines.Add(pipeline);
        await _db.SaveChangesAsync();

        var message = new ResourcesCreatedEvent(
            projectId,
            Guid.NewGuid(),
            Guid.NewGuid(),
            new List<ResourceVersionCreatedInfo> { new(Guid.NewGuid(), ".fbx", null, "Eva.fbx") }
        );

        // Act
        await _handler.Handle(message, CancellationToken.None);

        // Assert: Chặn đứng kích hoạt nhầm toàn project
        await _bus.DidNotReceiveWithAnyArgs().InvokeAsync<Result<PipelineExecutionDto>>(default!);
    }

    [Fact]
    public async Task Handle_WithAllowAllRepositoriesTrue_ShouldTriggerOnAnyRepositoryInProject()
    {
        // Arrange: Pipeline bật tường minh allowAllRepositories: true
        var projectId = Guid.NewGuid();
        var configJson = JsonSerializer.SerializeToDocument(new
        {
            allowAllRepositories = true,
            extensions = new[] { "fbx" }
        });

        var pipeline = new Domain.Entities.Pipeline(
            projectId,
            "Global Watcher Pipeline",
            PipelineTriggerType.OnResourceCreated,
            configJson
        );
        _db.Pipelines.Add(pipeline);
        await _db.SaveChangesAsync();

        var message = new ResourcesCreatedEvent(
            projectId,
            Guid.NewGuid(),
            Guid.NewGuid(),
            new List<ResourceVersionCreatedInfo> { new(Guid.NewGuid(), ".fbx", null, "Eva.fbx") }
        );

        // Act
        await _handler.Handle(message, CancellationToken.None);

        // Assert: Trigger thành công
        await _bus.Received(1).InvokeAsync<Result<PipelineExecutionDto>>(
            Arg.Is<RunPipelineCommand>(c => c.PipelineId == pipeline.Id),
            Arg.Any<CancellationToken>()
        );
    }

    [Fact]
    public async Task Handle_WithTriggerModeAskBefore_WhenNotApproved_ShouldSkipExecution()
    {
        // Arrange: Pipeline cấu hình AskBefore
        var projectId = Guid.NewGuid();
        var repoId = Guid.NewGuid();
        var configJson = JsonSerializer.SerializeToDocument(new
        {
            triggerMode = "AskBefore",
            repositoryIds = new[] { repoId },
            extensions = new[] { "blend" }
        });

        var pipeline = new Domain.Entities.Pipeline(
            projectId,
            "Approval Needed Pipeline",
            PipelineTriggerType.OnResourceCreated,
            configJson
        );
        _db.Pipelines.Add(pipeline);
        await _db.SaveChangesAsync();

        // Message không chứa pipelineId trong ApprovedPipelineIds
        var otherPipelineId = Guid.NewGuid();
        var message = new ResourcesCreatedEvent(
            projectId,
            repoId,
            Guid.NewGuid(),
            new List<ResourceVersionCreatedInfo> { new(Guid.NewGuid(), ".blend", null, "Eva.blend") },
            ApprovedPipelineIds: new List<Guid> { otherPipelineId }
        );

        // Act
        await _handler.Handle(message, CancellationToken.None);

        // Assert: Bị bỏ qua vì user không tích chọn pipeline này
        await _bus.DidNotReceiveWithAnyArgs().InvokeAsync<Result<PipelineExecutionDto>>(default!);
    }

    [Fact]
    public async Task Handle_WithTriggerModeAskBefore_WhenApproved_ShouldTriggerSuccessfully()
    {
        // Arrange: Pipeline cấu hình AskBefore
        var projectId = Guid.NewGuid();
        var repoId = Guid.NewGuid();
        var configJson = JsonSerializer.SerializeToDocument(new
        {
            triggerMode = "AskBefore",
            repositoryIds = new[] { repoId },
            extensions = new[] { "blend" }
        });

        var pipeline = new Domain.Entities.Pipeline(
            projectId,
            "Approval Needed Pipeline",
            PipelineTriggerType.OnResourceCreated,
            configJson
        );
        _db.Pipelines.Add(pipeline);
        await _db.SaveChangesAsync();

        // Message có chứa pipelineId trong ApprovedPipelineIds
        var message = new ResourcesCreatedEvent(
            projectId,
            repoId,
            Guid.NewGuid(),
            new List<ResourceVersionCreatedInfo> { new(Guid.NewGuid(), ".blend", null, "Eva.blend") },
            ApprovedPipelineIds: new List<Guid> { pipeline.Id }
        );

        // Act
        await _handler.Handle(message, CancellationToken.None);

        // Assert: Trigger thành công
        await _bus.Received(1).InvokeAsync<Result<PipelineExecutionDto>>(
            Arg.Is<RunPipelineCommand>(c => c.PipelineId == pipeline.Id),
            Arg.Any<CancellationToken>()
        );
    }

    [Fact]
    public async Task Handle_WithLegacyRepositoryIdString_ShouldSupportBackwardCompatibility()
    {
        // Arrange: Pipeline lưu JSON cũ với "repositoryId": "..."
        var projectId = Guid.NewGuid();
        var repoId = Guid.NewGuid();
        var configJson = JsonSerializer.SerializeToDocument(new
        {
            repositoryId = repoId.ToString(),
            extension = ".blend"
        });

        var pipeline = new Domain.Entities.Pipeline(
            projectId,
            "Legacy Config Pipeline",
            PipelineTriggerType.OnResourceCreated,
            configJson
        );
        _db.Pipelines.Add(pipeline);
        await _db.SaveChangesAsync();

        var message = new ResourcesCreatedEvent(
            projectId,
            repoId,
            Guid.NewGuid(),
            new List<ResourceVersionCreatedInfo> { new(Guid.NewGuid(), ".blend", null, "Eva.blend") }
        );

        // Act
        await _handler.Handle(message, CancellationToken.None);

        // Assert: Tương thích ngược hoàn hảo
        await _bus.Received(1).InvokeAsync<Result<PipelineExecutionDto>>(
            Arg.Is<RunPipelineCommand>(c => c.PipelineId == pipeline.Id),
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
