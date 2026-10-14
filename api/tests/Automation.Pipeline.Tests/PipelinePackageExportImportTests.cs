using System.Text.Json;
using Automation.Files.Contracts;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine;
using Automation.Pipeline.Engine.DataResolver;
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

        _builder = new PipelineGraphDtoBuilder(_db, new EmptyTools(), Substitute.For<IEntityStructRegistry>(), _assets);
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

        var valHandler = new ValidatePipelinePackageHandler(_db);

        // Act
        var valRes = await valHandler.HandleAsync(new ValidatePipelinePackageRequest(_projectId, pkg), CancellationToken.None);

        // Assert
        valRes.IsSuccess.Should().BeTrue();
        valRes.Value.ValidationWarnings.Should().NotBeEmpty();
        valRes.Value.ValidationWarnings.Should().Contain(w => w.Contains("unresolved_script_key") && w.Contains("no source code"));
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

    private sealed class EmptyTools : IToolRegistry
    {
        public IReadOnlyList<IResolverTool> GetAll() => [];
        public IResolverTool? GetByKey(string key) => null;
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
