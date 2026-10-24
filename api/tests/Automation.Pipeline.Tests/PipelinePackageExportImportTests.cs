using System.Text.Json;
using Automation.Files.Contracts;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Contracts.NodeContract;
using Automation.Pipeline.Contracts.Validation;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine;
using Automation.Pipeline.Engine.DataResolver;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Engine.StructRegistry;
using Automation.Pipeline.Features.Pipelines;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Features.Pipelines.Services;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Tools;
using Automation.Studio.Contracts;
using FluentAssertions;
using FluentResults;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Wolverine;
using Xunit;
using PipelineEntity = Automation.Pipeline.Domain.Entities.Pipeline;

namespace Automation.Pipeline.Tests;

public sealed class PipelinePackageExportImportTests : IDisposable
{
    private readonly SqliteConnection _connection = new("Data Source=:memory:");
    private readonly PipelineDbContext _db;
    private readonly IAssetApi _assets = Substitute.For<IAssetApi>();
    private readonly IProjectsApi _projects = Substitute.For<IProjectsApi>();
    private readonly IHttpClientFactory _httpClientFactory = Substitute.For<IHttpClientFactory>();
    private readonly PipelineGraphDtoBuilder _builder;
    private readonly PipelineEntity _pipeline;
    private readonly Guid _projectId = Guid.NewGuid();
    private readonly ITransientPipelineGraphFactory _transientFactory;
    private readonly IPipelineContractValidator _contractValidator;
    private readonly IToolRegistry _toolRegistry;
    private readonly IEntityStructRegistry _structRegistry;

    public PipelinePackageExportImportTests()
    {
        _connection.Open();
        _connection.CreateCollation("case_insensitive", (a, b) => string.Compare(a, b, StringComparison.OrdinalIgnoreCase));
        _db = new TestDb(new DbContextOptionsBuilder<PipelineDbContext>().UseSqlite(_connection).Options);
        _db.Database.EnsureCreated();

        _pipeline = new PipelineEntity(_projectId, "Test Pipeline");
        _db.Pipelines.Add(_pipeline);

        var fileConfigJson = JsonSerializer.SerializeToDocument(new Dictionary<string, object?>
        {
            ["AssetFile"] = new Dictionary<string, object?>
            {
                ["status"] = "unbound",
                ["originalFileName"] = "character_model.fbx",
                ["hashSha256"] = "abc123hash",
                ["sizeBytes"] = 2048,
                ["contentType"] = "application/octet-stream"
            }
        });

        var nodeWithUnboundFile = new PipelineNode(
            id: Guid.NewGuid(),
            pipelineId: _pipeline.Id,
            refId: "test_tool",
            kind: PipelineNodeKind.Tool,
            positionX: 100,
            positionY: 100,
            config: fileConfigJson
        );

        var customNodeMissingScript = new PipelineNode(
            id: Guid.NewGuid(),
            pipelineId: _pipeline.Id,
            refId: "unresolved_script_key",
            kind: PipelineNodeKind.Custom,
            positionX: 300,
            positionY: 100
        );

        _db.PipelineNodes.AddRange(nodeWithUnboundFile, customNodeMissingScript);
        _db.SaveChanges();

        _toolRegistry = new EmptyTools();
        _structRegistry = Substitute.For<IEntityStructRegistry>();
        var contractResolver = new PipelineNodeContractResolver(_db, _toolRegistry, _structRegistry);
        _contractValidator = new PipelineContractValidator(contractResolver, _structRegistry);
        _transientFactory = new TransientPipelineGraphFactory(_db);

        _builder = new PipelineGraphDtoBuilder(_db, _toolRegistry, _structRegistry, _assets);
        _projects.GetProjectStorageProfileIdAsync(_projectId, Arg.Any<CancellationToken>())
            .Returns(Guid.NewGuid());
        _assets.GetFilesAsync(Arg.Any<IEnumerable<string>>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(Result.Ok<Dictionary<string, IReadOnlyList<AssetLinkDto>>>(new())));
        _assets.FindLinksByIdsAsync(Arg.Any<IEnumerable<AssetLinkReference>>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(Result.Ok<IReadOnlyList<AssetLinkDto>>([])));
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    [Fact]
    public async Task ExportPipelines_FullBackup_ShouldPreserveFilePinsMetadata()
    {
        // Arrange
        var handler = new ExportPipelinesHandler(
            _db,
            _builder,
            _assets,
            _httpClientFactory,
            NullLogger<ExportPipelinesHandler>.Instance
        );

        // Act
        var result = await handler.HandleAsync(new ExportPipelinesQuery([_pipeline.Id], ExportPipelineMode.FullBackup), CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        var pkg = result.Value;
        pkg.Pipelines.Should().HaveCount(1);

        var fileNode = pkg.Pipelines[0].Graph.Nodes.First(n => n.Kind == PipelineNodeKind.Tool);
        fileNode.FilePins.Should().NotBeNull();
        fileNode.FilePins.Should().ContainKey("AssetFile");
        fileNode.FilePins!["AssetFile"].OriginalFileName.Should().Be("character_model.fbx");
        fileNode.FilePins!["AssetFile"].SizeBytes.Should().Be(2048);
        fileNode.FilePins!["AssetFile"].HashSha256.Should().Be("abc123hash");
    }

    [Fact]
    public async Task ExportPipelines_CleanTemplate_ShouldStripFilePinsMetadata()
    {
        // Arrange
        var handler = new ExportPipelinesHandler(_db, _builder, _assets, _httpClientFactory, NullLogger<ExportPipelinesHandler>.Instance);

        // Act
        var result = await handler.HandleAsync(new ExportPipelinesQuery([_pipeline.Id], ExportPipelineMode.CleanTemplate), CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        var pkg = result.Value;
        var fileNode = pkg.Pipelines[0].Graph.Nodes.First(n => n.Kind == PipelineNodeKind.Tool);
        fileNode.FilePins.Should().BeNull();
    }

    [Fact]
    public async Task ValidatePipelinePackage_ShouldDetectMissingCustomScriptWarning()
    {
        // Arrange
        var exportHandler = new ExportPipelinesHandler(_db, _builder, _assets, _httpClientFactory, NullLogger<ExportPipelinesHandler>.Instance);
        var exportRes = await exportHandler.HandleAsync(new ExportPipelinesQuery([_pipeline.Id], ExportPipelineMode.FullBackup), CancellationToken.None);
        var pkg = exportRes.Value;

        var valHandler = new ValidatePipelinePackageHandler(_db, _transientFactory, _contractValidator);

        // Act
        var valRes = await valHandler.HandleAsync(new ValidatePipelinePackageRequest(_projectId, pkg), CancellationToken.None);

        // Assert
        valRes.IsSuccess.Should().BeTrue();
        valRes.Value.ValidationWarnings.Should().NotBeEmpty();
        valRes.Value.ValidationWarnings.Should().Contain(w => w.Contains("unresolved_script_key") && w.Contains("no source code"));
    }

    [Fact]
    public async Task ValidatePipelinePackage_StructuralError_Cycle_ReturnsErrors()
    {
        // Arrange: Tạo gói có chu trình Exec lặp vô tận (ref-1 -> ref-2 -> ref-1)
        var cyclePkg = new PipelinePackageDto(
            FormatVersion: "1.0",
            BundleType: "Single",
            ExportedAt: DateTimeOffset.UtcNow,
            Metadata: new PipelinePackageMetadataDto(1, 1, 0),
            Pipelines:
            [
                new PipelinePackageItemDto(
                    BundleId: "cycle-bundle",
                    Name: "Cycle Pipeline",
                    Description: null,
                    IsRoot: true,
                    ImportOrder: 1,
                    DependsOn: [],
                    TriggerType: PipelineTriggerType.Manual,
                    Parameters: [],
                    Graph: new PipelinePackageGraphDto(
                        Nodes:
                        [
                            new PipelinePackageNodeDto("n1", "Start", PipelineNodeKind.Start, "Start", null, null, new NodePosition(0, 0), [], [], null),
                            new PipelinePackageNodeDto("n2", "ToolA", PipelineNodeKind.Tool, "ToolA", null, null, new NodePosition(100, 0), [], [], null)
                        ],
                        Edges:
                        [
                            new PipelinePackageEdgeDto("n1", "exec_out", "n2", "exec_in", EdgeKind.Exec),
                            new PipelinePackageEdgeDto("n2", "exec_out", "n1", "exec_in", EdgeKind.Exec)
                        ]
                    )
                )
            ],
            Dependencies: new PipelinePackageDependenciesDto([], [])
        );

        var valHandler = new ValidatePipelinePackageHandler(_db, _transientFactory, _contractValidator);

        // Act
        var valRes = await valHandler.HandleAsync(new ValidatePipelinePackageRequest(_projectId, cyclePkg), CancellationToken.None);

        // Assert: Bị chặn IsValid = false vì lỗi cấu trúc chu trình
        valRes.IsSuccess.Should().BeTrue();
        valRes.Value.IsValid.Should().BeFalse();
        valRes.Value.ValidationErrors.Should().Contain(e => e.Contains("cycle") || e.Contains("Cycle"));
    }

    [Fact]
    public async Task ImportPipelinePackage_ShouldPreserveUnboundPins_AndFlagUnresolvedScripts()
    {
        // Arrange
        var exportHandler = new ExportPipelinesHandler(_db, _builder, _assets, _httpClientFactory, NullLogger<ExportPipelinesHandler>.Instance);
        var exportRes = await exportHandler.HandleAsync(new ExportPipelinesQuery([_pipeline.Id], ExportPipelineMode.FullBackup), CancellationToken.None);
        var pkg = exportRes.Value;

        var importHandler = new ImportPipelinePackageHandler(
            _db,
            _assets,
            _httpClientFactory,
            NullLogger<ImportPipelinePackageHandler>.Instance,
            _transientFactory,
            _contractValidator,
            _projects
        );

        // Act
        var importRes = await importHandler.HandleAsync(
            new ImportPipelinePackageRequest(_projectId, pkg, NamePrefix: "[Imported] "),
            CancellationToken.None
        );

        // Assert
        importRes.IsSuccess.Should().BeTrue();
        importRes.Value.ImportedPipelinesCount.Should().Be(1);
        var importedPipeId = importRes.Value.Pipelines[0].PipelineId;

        var importedPipeline = await _db.Pipelines
            .Include(p => p.Nodes)
            .Include(p => p.Edges)
            .FirstAsync(p => p.Id == importedPipeId);

        // Check Custom Node flagged
        var customNode = importedPipeline.Nodes.First(n => n.Kind == PipelineNodeKind.Custom);
        customNode.Metadata.Should().NotBeNull();
        customNode.Metadata!.RootElement.GetProperty("unresolvedScript").GetBoolean().Should().BeTrue();

        // Check Hydrated Graph has Unbound pin
        var hydratedGraph = await _builder.BuildDtoAsync(importedPipeline, CancellationToken.None);
        var fileNodeDto = hydratedGraph.Nodes.First(n => n.Kind == PipelineNodeKind.Tool);
        fileNodeDto.FileAssets.Should().ContainKey("AssetFile");
        fileNodeDto.FileAssets["AssetFile"].Status.Should().Be("Unbound");
        fileNodeDto.FileAssets["AssetFile"].OriginalName.Should().Be("character_model.fbx");
    }

    [Fact]
    public async Task ImportPipelinePackage_StructuralError_RejectsImport()
    {
        // Arrange: Gói có chu trình lặp vô tận
        var cyclePkg = new PipelinePackageDto(
            FormatVersion: "1.0",
            BundleType: "Single",
            ExportedAt: DateTimeOffset.UtcNow,
            Metadata: new PipelinePackageMetadataDto(1, 1, 0),
            Pipelines:
            [
                new PipelinePackageItemDto(
                    BundleId: "cycle-bundle",
                    Name: "Cycle Pipeline",
                    Description: null,
                    IsRoot: true,
                    ImportOrder: 1,
                    DependsOn: [],
                    TriggerType: PipelineTriggerType.Manual,
                    Parameters: [],
                    Graph: new PipelinePackageGraphDto(
                        Nodes:
                        [
                            new PipelinePackageNodeDto("n1", "Start", PipelineNodeKind.Start, "Start", null, null, new NodePosition(0, 0), [], [], null),
                            new PipelinePackageNodeDto("n2", "ToolA", PipelineNodeKind.Tool, "ToolA", null, null, new NodePosition(100, 0), [], [], null)
                        ],
                        Edges:
                        [
                            new PipelinePackageEdgeDto("n1", "exec_out", "n2", "exec_in", EdgeKind.Exec),
                            new PipelinePackageEdgeDto("n2", "exec_out", "n1", "exec_in", EdgeKind.Exec)
                        ]
                    )
                )
            ],
            Dependencies: new PipelinePackageDependenciesDto([], [])
        );

        var importHandler = new ImportPipelinePackageHandler(
            _db,
            _assets,
            _httpClientFactory,
            NullLogger<ImportPipelinePackageHandler>.Instance,
            _transientFactory,
            _contractValidator,
            _projects
        );

        // Act
        var result = await importHandler.HandleAsync(
            new ImportPipelinePackageRequest(_projectId, cyclePkg),
            CancellationToken.None
        );

        // Assert: Thất bại, từ chối import và không lưu vào DB
        result.IsFailed.Should().BeTrue();
        result.Errors[0].Message.Should().Contain("structural error");
    }

    [Fact]
    public async Task ValidatePipeline_WithDraftSnapshot_ValidatesInMemoryDraft()
    {
        // Arrange: Pipeline trong DB chỉ có 1 node rỗng
        var draftPipeline = new PipelineEntity(_projectId, "Draft Pipeline");
        _db.Pipelines.Add(draftPipeline);
        await _db.SaveChangesAsync();

        var handler = new ValidatePipelineHandler(_db, _contractValidator, _transientFactory);

        // Gửi Draft Snapshot có node BreakStruct chưa chọn StructType (UnselectedStructSchema)
        var node1Id = Guid.NewGuid();
        var draftNodes = new List<SavePipelineNodeItem>
        {
            new SavePipelineNodeItem(node1Id, "BreakStruct", PipelineNodeKind.Tool, 0, 0, new Dictionary<string, object?>())
        };

        var query = new ValidatePipelineQuery(draftPipeline.Id, null, draftNodes, []);

        // Act
        var result = await handler.HandleAsync(query, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.IsValid.Should().BeFalse();
        result.Value.Diagnostics.Should().Contain(d => d.Code == PipelineDiagnosticCode.UnselectedStructSchema);
    }

    [Fact]
    public async Task RunPipeline_WithUnresolvedPins_FailsPreflightWithUnresolvedPinsError()
    {
        // Arrange: Pipeline có node BreakStruct chưa chọn StructType
        var brokenPipeline = new PipelineEntity(_projectId, "Broken Preflight Pipeline");
        brokenPipeline.AddNode("BreakStruct", "Tool", 0, 0);
        _db.Pipelines.Add(brokenPipeline);
        await _db.SaveChangesAsync();

        var mockBus = Substitute.For<IMessageBus>();
        var runHandler = new RunPipelineHandler(_db, mockBus, _assets, _contractValidator);
        var command = new RunPipelineCommand(brokenPipeline.Id);

        // Act
        var result = await runHandler.HandleAsync(command, CancellationToken.None);

        // Assert: Bị chặn ngay tại Preflight, trả về UnresolvedPinsError
        result.IsFailed.Should().BeTrue();
        result.Errors[0].Should().BeOfType<UnresolvedPinsError>();
        var err = (UnresolvedPinsError)result.Errors[0];
        err.Diagnostics.Should().NotBeNull();
        err.Diagnostics!.Should().Contain(d => d.Code == PipelineDiagnosticCode.UnselectedStructSchema);

        // Đảm bảo không tạo bất kỳ execution nào trong DB
        var executionExists = await _db.PipelineExecutions.AnyAsync(x => x.PipelineId == brokenPipeline.Id);
        executionExists.Should().BeFalse();
        await mockBus.DidNotReceive().PublishAsync(Arg.Any<TriggerPipelineExecutionMessage>(), Arg.Any<DeliveryOptions?>());
    }

    private sealed class EmptyTools : IToolRegistry
    {
        private readonly FakeTool _testTool = new();
        public IReadOnlyList<IResolverTool> GetAll() => [_testTool];
        public IResolverTool? GetByKey(string key) => key == "test_tool" ? _testTool : null;

        private sealed class FakeTool : IResolverTool
        {
            public string Key => "test_tool";
            public string Label => "Test Tool";
            public IReadOnlyList<PinDefinition> Inputs =>
            [
                new PinDefinition
                {
                    Id = "AssetFile",
                    Label = "Asset File",
                    Kind = PinKind.Data,
                    PrimitiveType = PinPrimitiveType.Asset,
                    Cardinality = PinCardinality.Single,
                    IsRequired = false
                }
            ];
            public IReadOnlyList<PinDefinition> Outputs => [];
            public Task<Dictionary<string, object>> ExecuteAsync(Dictionary<string, object> inputs, ToolExecutionContext context)
                => Task.FromResult(new Dictionary<string, object>());
        }
    }

    private sealed class TestDb(DbContextOptions<PipelineDbContext> options) : PipelineDbContext(options)
    {
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            foreach (var type in modelBuilder.Model.GetEntityTypes())
                foreach (var property in type.GetProperties().Where(x => x.ClrType == typeof(JsonDocument)))
                    property.SetValueConverter(new Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<JsonDocument?, string?>(
                        x => x != null ? x.RootElement.GetRawText() : null,
                        x => x != null ? JsonDocument.Parse(x, default) : null));
        }
    }
}
