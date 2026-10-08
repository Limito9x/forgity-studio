using System.Text.Json;
using Automation.Files.Contracts;
using Automation.Pipeline.Domain.Entities;
using PipelineEntity = Automation.Pipeline.Domain.Entities.Pipeline;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine;
using Automation.Pipeline.Engine.DataResolver;
using Automation.Pipeline.Engine.DataResolver.Resolvers;
using Automation.Pipeline.Features.Execution;
using Automation.Pipeline.Grpc;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Infrastructure.Redis;
using Automation.Pipeline.Tools;
using FluentAssertions;
using Grpc.Core;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace Automation.Pipeline.Tests;

public class ExecutionStateGrpcServiceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly PipelineDbContext _db;
    private readonly IExecutionMemoryStore _memoryStore = new RedisExecutionMemoryStore(NullLogger<RedisExecutionMemoryStore>.Instance);
    private readonly IExecutionStateStore _stateStore = new RedisExecutionStateStore(NullLogger<RedisExecutionStateStore>.Instance);
    private readonly FakeToolRegistry _toolRegistry = new();
    private readonly IAssetApi _assetApi = Substitute.For<IAssetApi>();
    private readonly ExecutionStateGrpcService _grpcService;

    public ExecutionStateGrpcServiceTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<PipelineDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new TestPipelineDbContext(options);
        _db.Database.EnsureCreated();

        var graphProvider = new PipelineGraphProvider(_db);
        var assetResolver = new AssetResolver(_assetApi, NullLogger<AssetResolver>.Instance);
        var pureNodeResolver = new PureNodeResolver(_toolRegistry, _memoryStore, graphProvider, NullLogger<PureNodeResolver>.Instance);
        var pinResolver = new PinValueResolver(
            graphProvider,
            _memoryStore,
            _toolRegistry,
            pureNodeResolver,
            assetResolver,
            NullLogger<PinValueResolver>.Instance
        );

        _grpcService = new ExecutionStateGrpcService(
            pinResolver,
            _memoryStore,
            _stateStore,
            _db,
            NullLogger<ExecutionStateGrpcService>.Instance
        );
    }

    [Fact]
    public async Task GetStepInputs_ShouldResolvePinsOnDemandViaGrpc()
    {
        var pipeline = new PipelineEntity(Guid.NewGuid(), "GrpcPipeline");
        var configDoc = JsonDocument.Parse("{\"MeshPath\": \"D:/models/dragon.fbx\", \"Scale\": 2.0}");
        var node = new PipelineNode(Guid.NewGuid(), pipeline.Id, "ImportTool", "Tool", 0, 0, configDoc);

        pipeline.AddNode(node);
        _db.Pipelines.Add(pipeline);

        var execution = new PipelineExecution(pipeline.Id);
        _db.PipelineExecutions.Add(execution);
        await _db.SaveChangesAsync();

        var request = new GetStepInputsRequest
        {
            PipelineExecutionId = execution.Id.ToString(),
            StepExecutionId = node.Id.ToString(),
            InputMappings =
            {
                new InputMappingItem { PinKey = "MeshPath", SourceKind = "literal" },
                new InputMappingItem { PinKey = "Scale", SourceKind = "literal" }
            }
        };

        var response = await _grpcService.GetStepInputs(request, CreateTestServerCallContext());

        response.Success.Should().BeTrue();
        response.InputsJson.Should().ContainKey("MeshPath");
        response.InputsJson["MeshPath"].Should().Contain("D:/models/dragon.fbx");
        response.InputsJson["Scale"].Should().Be("2");
    }

    [Fact]
    public async Task ReportStepOutput_ShouldPersistOutputAndMarkNodeSucceeded()
    {
        var pipeline = new PipelineEntity(Guid.NewGuid(), "ReportPipeline");
        var node = new PipelineNode(Guid.NewGuid(), pipeline.Id, "ExportTool", "Tool", 0, 0);

        pipeline.AddNode(node);
        _db.Pipelines.Add(pipeline);

        var execution = new PipelineExecution(pipeline.Id);
        _db.PipelineExecutions.Add(execution);
        await _db.SaveChangesAsync();

        var request = new ReportStepOutputRequest
        {
            PipelineExecutionId = execution.Id.ToString(),
            StepExecutionId = node.Id.ToString(),
            OutputsJson =
            {
                ["ExportedPath"] = "\"D:/exports/final_model.glb\"",
                ["VertexCount"] = "15420"
            },
            Log = "{\"message\": \"Export completed in 1.2s\"}"
        };

        var response = await _grpcService.ReportStepOutput(request, CreateTestServerCallContext());

        response.Success.Should().BeTrue();

        // Verify stored in MemoryStore
        var savedPath = await _memoryStore.GetNodePinValueAsync(execution.Id, node.Id, "ExportedPath");
        savedPath.Should().Be("D:/exports/final_model.glb");

        // Verify Redis StateStore status
        var status = await _stateStore.GetNodeStatusAsync(execution.Id, node.Id);
        status.Should().Be("Succeeded");
    }

    public void Dispose()
    {
        _connection.Dispose();
    }

    private static ServerCallContext CreateTestServerCallContext()
    {
        return new FakeServerCallContext();
    }

    private class FakeServerCallContext : ServerCallContext
    {
        protected override string MethodCore => "TestMethod";
        protected override string HostCore => "localhost";
        protected override string PeerCore => "127.0.0.1";
        protected override DateTime DeadlineCore => DateTime.UtcNow.AddMinutes(1);
        protected override Metadata RequestHeadersCore => [];
        protected override CancellationToken CancellationTokenCore => CancellationToken.None;
        protected override Metadata ResponseTrailersCore => [];
        protected override Status StatusCore { get; set; }
        protected override WriteOptions? WriteOptionsCore { get; set; }
        protected override AuthContext AuthContextCore => new(null, new Dictionary<string, List<AuthProperty>>());

        protected override ContextPropagationToken CreatePropagationTokenCore(ContextPropagationOptions? options) => throw new NotImplementedException();
        protected override Task WriteResponseHeadersAsyncCore(Metadata responseHeaders) => Task.CompletedTask;
    }

    private class FakeToolRegistry : IToolRegistry
    {
        public IReadOnlyList<IResolverTool> GetAll() => [];
        public IResolverTool? GetByKey(string key) => null;
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
