using System.Text.Json;
using Automation.Files.Contracts;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine;
using Automation.Pipeline.Engine.DataResolver;
using Automation.Pipeline.Engine.DataResolver.Resolvers;
using Automation.Pipeline.Engine.StructRegistry;
using Automation.Pipeline.Features.Pipelines;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Features.Pipelines.Services;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Tools;
using FluentResults;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Wolverine;
using Automation.SharedKernel.Domain.Events;
using Automation.SharedKernel.Infrastructure.Persistence;
using Automation.Pipeline.Features.Nodes;
using Xunit;
using PipelineEntity = Automation.Pipeline.Domain.Entities.Pipeline;

namespace Automation.Pipeline.Tests;

public sealed class PipelineFileParameterTests : IDisposable
{
    private readonly SqliteConnection _connection = new("Data Source=:memory:");
    private readonly PipelineDbContext _db;
    private readonly IAssetApi _assets = Substitute.For<IAssetApi>();
    private readonly IMessageBus _bus = Substitute.For<IMessageBus>();
    private readonly Dictionary<Guid, (AssetLinkDto File, AssetLinkOwner Owner)> _links = [];
    private readonly PipelineGraphDtoBuilder _builder;
    private readonly PipelineEntity _pipeline = new(Guid.NewGuid(), "File pipeline");
    private readonly List<EntityDeletedMessage> _deleted = [];

    public PipelineFileParameterTests()
    {
        _connection.Open();
        _connection.CreateCollation("case_insensitive", (a, b) => string.Compare(a, b, StringComparison.OrdinalIgnoreCase));
        _db = new TestDb(new DbContextOptionsBuilder<PipelineDbContext>().UseSqlite(_connection)
            .AddInterceptors(EntityDeletedInterceptor.CreateForTest(_bus)).Options);
        _db.Database.EnsureCreated();
        _db.Pipelines.Add(_pipeline);
        _db.NodeDefinitions.Add(new NodeDefinition
        {
            ProjectId = _pipeline.ProjectId, Key = "file-node", Name = "File node", Label = "File node", Executor = "python",
            Inputs = [new() { Id = "File", PrimitiveType = PinPrimitiveType.Asset }, new() { Id = "Other", PrimitiveType = PinPrimitiveType.Asset },
                new() { Id = "EntityId", PrimitiveType = PinPrimitiveType.EntityRef }], Outputs = []
        });
        _db.SaveChanges();
        _builder = new(_db, new EmptyTools(), Substitute.For<IEntityStructRegistry>(), _assets);
        _assets.CreateLinkAsync(Arg.Any<AssetLinkRequestItem>(), Arg.Any<AssetLinkOwner>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(call =>
            {
                var item = call.Arg<AssetLinkRequestItem>();
                var owner = call.Arg<AssetLinkOwner>();
                var file = new AssetLinkDto(Guid.NewGuid(), item.AssetId, "https://storage.example/file", item.OriginalName,
                    "text/plain", 10, 0, owner.SlotKey, DateTimeOffset.UtcNow, new string('a', 64));
                _links[file.AssetLinkId] = (file, owner);
                return Task.FromResult(Result.Ok(file));
            });
        _assets.ReplaceSingleLinkAsync(Arg.Any<AssetLinkRequestItem>(), Arg.Any<AssetLinkOwner>(),
            Arg.Any<string?>(), Arg.Any<CancellationToken>()).Returns(call =>
        {
            if (call.ArgAt<string?>(2) is { Length: > 0 } hash && hash != new string('a', 64))
                return Task.FromResult(Result.Fail<AssetLinkDto>("Script hash mismatch."));
            var item = call.Arg<AssetLinkRequestItem>();
            var owner = call.Arg<AssetLinkOwner>();
            foreach (var id in _links.Where(x => x.Value.Owner == owner).Select(x => x.Key).ToList()) _links.Remove(id);
            var file = new AssetLinkDto(Guid.NewGuid(), item.AssetId, "https://storage.example/file", item.OriginalName,
                "text/plain", 10, 0, owner.SlotKey, DateTimeOffset.UtcNow, new string('a', 64));
            _links[file.AssetLinkId] = (file, owner);
            return Task.FromResult(Result.Ok(file));
        });
        _assets.GetLinksByIdsAsync(Arg.Any<IEnumerable<AssetLinkReference>>(), Arg.Any<CancellationToken>()).Returns(call =>
        {
            var requested = call.Arg<IEnumerable<AssetLinkReference>>().ToList();
            if (requested.Any(x => !_links.TryGetValue(x.AssetLinkId, out var link) || link.Owner != x.Owner))
                return Task.FromResult(Result.Fail<IReadOnlyList<AssetLinkDto>>("Link missing or wrong owner."));
            return Task.FromResult(Result.Ok<IReadOnlyList<AssetLinkDto>>(requested.Select(x => _links[x.AssetLinkId].File).Distinct().ToList()));
        });
        _assets.RemoveLinkByIdAsync(Arg.Any<AssetLinkReference>(), Arg.Any<CancellationToken>()).Returns(call =>
        {
            _links.Remove(call.Arg<AssetLinkReference>().AssetLinkId);
            return Task.FromResult(Result.Ok());
        });
        _assets.FindLinksByIdsAsync(Arg.Any<IEnumerable<AssetLinkReference>>(), Arg.Any<CancellationToken>()).Returns(call =>
            Task.FromResult(Result.Ok<IReadOnlyList<AssetLinkDto>>(call.Arg<IEnumerable<AssetLinkReference>>()
                .Where(x => _links.TryGetValue(x.AssetLinkId, out var link) && link.Owner == x.Owner)
                .Select(x => _links[x.AssetLinkId].File).Distinct().ToList())));
        _assets.GetFilesAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(call =>
            Task.FromResult(Result.Ok<IReadOnlyList<AssetLinkDto>>(_links.Values.Where(x =>
                x.Owner.EntityId == call.ArgAt<string>(0) && x.Owner.EntityType == call.ArgAt<string>(1) &&
                x.Owner.SlotKey == call.ArgAt<string>(2)).Select(x => x.File).ToList())));
        _assets.GetAllFilesForEntityAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(call =>
            Task.FromResult(Result.Ok(_links.Values.Where(x => x.Owner.EntityId == call.ArgAt<string>(0))
                .Select(x => x.File).ToLookup(x => x.SlotKey))));
        _assets.ResolveOrCloneLinkAsync(Arg.Any<Guid>(), Arg.Any<AssetLinkOwner>(), Arg.Any<CancellationToken>()).Returns(call =>
        {
            var id = call.Arg<Guid>();
            var targetOwner = call.Arg<AssetLinkOwner>();
            if (!_links.TryGetValue(id, out var link))
                return Task.FromResult(Result.Fail<AssetLinkDto>($"Asset link '{id}' not found."));

            if (link.Owner == targetOwner)
                return Task.FromResult(Result.Ok(link.File));

            var clonedFile = new AssetLinkDto(Guid.NewGuid(), link.File.AssetId, "https://storage.example/file", link.File.OriginalName,
                "text/plain", 10, 0, targetOwner.SlotKey, DateTimeOffset.UtcNow, new string('a', 64));
            _links[clonedFile.AssetLinkId] = (clonedFile, targetOwner);
            return Task.FromResult(Result.Ok(clonedFile));
        });
        _bus.When(x => x.PublishAsync(Arg.Any<EntityDeletedMessage>(), Arg.Any<DeliveryOptions>()))
            .Do(call => _deleted.Add(call.Arg<EntityDeletedMessage>()));
    }

    private SavePipelineGraphHandler Saver() => new(_db, _builder, _assets, NullLogger<SavePipelineGraphHandler>.Instance);
    private SavePipelineNodeItem Item(Guid id, object? config) =>
        new(id, "file-node", PipelineNodeKind.Tool, 0, 0,
            config == null ? [] : JsonSerializer.Deserialize<Dictionary<string, object?>>(JsonSerializer.Serialize(config)));
    private async Task<PipelineGraphDto> Save(params SavePipelineNodeItem[] nodes)
    {
        var result = await Saver().HandleAsync(new(_pipeline.Id, nodes.ToList(), []), CancellationToken.None);
        Assert.True(result.IsSuccess, string.Join("; ", result.Errors.Select(x => x.Message)));
        return result.Value;
    }

    [Fact]
    public async Task UploadSaveReload_QueryAndRuntimeUseLinkNameAndHash()
    {
        var nodeId = Guid.NewGuid();
        var entityId = Guid.NewGuid();
        var saved = await Save(Item(nodeId, new { File = new { assetId = Guid.NewGuid(), originalName = "preset.txt" }, EntityId = entityId }));
        var file = saved.Nodes.Single().FileAssets!["File"];
        Assert.Equal("preset.txt", file.OriginalName);
        Assert.Equal("Available", file.Status);
        Assert.Equal(entityId.ToString(), ((JsonElement)saved.Nodes.Single().ConfigValues!["EntityId"]!).GetString());
        _db.ChangeTracker.Clear();
        var reloaded = await _db.Pipelines.Include(x => x.Nodes).Include(x => x.Edges).SingleAsync();
        var queried = await _builder.BuildDtoAsync(reloaded);
        Assert.Equal(file, queried.Nodes.Single().FileAssets!["File"]);
        var node = reloaded.Nodes.Single();
        var runtime = await new AssetResolver(_assets, NullLogger<AssetResolver>.Instance).ResolveFileAsync(
            node.Config!.RootElement.GetProperty("File"), PipelineFileValue.Owner(nodeId, "File"));
        var transport = PipelineFileValue.AsJson(runtime).GetProperty("$file");
        Assert.Equal("preset.txt", transport.GetProperty("filename").GetString());
        Assert.Equal(new string('a', 64), transport.GetProperty("hash").GetString());
    }

    [Fact]
    public async Task SameAssetOnTwoPins_KeepsNamesAndIndependentLinkPks()
    {
        var assetId = Guid.NewGuid();
        var result = await Save(Item(Guid.NewGuid(), new
        {
            File = new { assetId, originalName = "one.txt" }, Other = new { assetId, originalName = "two.txt" }
        }));
        var files = result.Nodes.Single().FileAssets!;
        Assert.Equal("one.txt", files["File"].OriginalName);
        Assert.Equal("two.txt", files["Other"].OriginalName);
        Assert.NotEqual(files["File"].AssetLinkId, files["Other"].AssetLinkId);
    }

    [Fact]
    public async Task ReplaceClearDelete_CleanupRunsAfterSaveAndKeepsOtherPins()
    {
        var nodeId = Guid.NewGuid();
        var first = await Save(Item(nodeId, new { File = new { assetId = Guid.NewGuid(), originalName = "one.txt" } }));
        var oldId = first.Nodes.Single().FileAssets!["File"].AssetLinkId!.Value;
        var second = await Save(Item(nodeId, new { File = new { assetId = Guid.NewGuid(), originalName = "two.txt" } }));
        var newId = second.Nodes.Single().FileAssets!["File"].AssetLinkId!.Value;
        Assert.DoesNotContain(oldId, _links.Keys);
        Assert.Contains(newId, _links.Keys);
        await Save(Item(nodeId, new { File = (object?)null }));
        Assert.Empty(_links);
        await Save(Item(nodeId, new { File = new { assetId = Guid.NewGuid(), originalName = "three.txt" } }));
        await Save();
        Assert.Single(_links); // Files consumes the shared deletion event, not pin cleanup.
        Assert.Contains(new EntityDeletedMessage("PipelineNode", nodeId.ToString()), _deleted);
    }

    [Fact]
    public async Task InvalidSecondPin_CompensatesCreatedLinkAndPreservesSavedGraph()
    {
        var nodeId = Guid.NewGuid();
        var first = await Save(Item(nodeId, new { File = new { assetId = Guid.NewGuid(), originalName = "old.txt" } }));
        var oldId = first.Nodes.Single().FileAssets!["File"].AssetLinkId!.Value;
        var result = await Saver().HandleAsync(new(_pipeline.Id, [Item(nodeId, new
        {
            File = new { assetId = Guid.NewGuid(), originalName = "new.txt" }, Other = new { assetLinkId = Guid.NewGuid() }
        })], []), CancellationToken.None);
        Assert.True(result.IsFailed);
        Assert.Equal(oldId, Assert.Single(_links.Keys));
        var stored = await _db.PipelineNodes.AsNoTracking().SingleAsync();
        Assert.Equal(oldId, stored.Config!.RootElement.GetProperty("File").GetProperty("assetLinkId").GetGuid());
        Assert.Empty(_db.ChangeTracker.Entries());
    }

    [Fact]
    public async Task LinkFromAnotherNode_IsClonedForNewNode()
    {
        var first = await Save(Item(Guid.NewGuid(), new { File = new { assetId = Guid.NewGuid(), originalName = "one.txt" } }));
        var linkId = first.Nodes.Single().FileAssets!["File"].AssetLinkId;
        var newNodeId = Guid.NewGuid();
        var result = await Saver().HandleAsync(new(_pipeline.Id,
            [Item(newNodeId, new { File = new { assetLinkId = linkId } })], []), CancellationToken.None);
        Assert.True(result.IsSuccess, string.Join("; ", result.Errors.Select(x => x.Message)));
        Assert.Equal(2, _links.Count);
        var stored = await _db.PipelineNodes.AsNoTracking().FirstOrDefaultAsync(x => x.Id == newNodeId);
        Assert.NotNull(stored);
        var newLinkId = stored.Config!.RootElement.GetProperty("File").GetProperty("assetLinkId").GetGuid();
        Assert.NotEqual(linkId, newLinkId);
        Assert.Equal(_links[linkId!.Value].File.AssetId, _links[newLinkId].File.AssetId);
    }

    [Fact]
    public async Task DeletePipeline_QueuesCleanupForAllItsNodes()
    {
        var nodeId = Guid.NewGuid();
        await Save(Item(nodeId, new { File = new { assetId = Guid.NewGuid(), originalName = "one.txt" } }));
        Assert.True((await new DeletePipelineHandler(_db).HandleAsync(new(_pipeline.Id), CancellationToken.None)).IsSuccess);
        Assert.True((await new PurgePipelineHandler(_db).HandleAsync(new(_pipeline.Id), CancellationToken.None)).IsSuccess);
        Assert.Single(_links);
        Assert.Contains(new EntityDeletedMessage("PipelineNode", nodeId.ToString()), _deleted);
        Assert.Contains(new EntityDeletedMessage("Pipeline", _pipeline.Id.ToString()), _deleted);
    }

    [Fact]
    public async Task MissingLink_QueryIsUnavailableAndRuntimeFails()
    {
        var id = Guid.NewGuid();
        var node = new PipelineNode(id, _pipeline.Id, "file-node", "Tool", 0, 0,
            JsonSerializer.SerializeToDocument(new { File = new { assetLinkId = Guid.NewGuid() } }));
        _pipeline.AddNode(node);
        var dto = await _builder.BuildDtoAsync(_pipeline);
        Assert.Equal("Unavailable", dto.Nodes.Single().FileAssets!["File"].Status);
        await Assert.ThrowsAsync<InvalidOperationException>(() => new AssetResolver(_assets, NullLogger<AssetResolver>.Instance)
            .ResolveFileAsync(node.Config!.RootElement.GetProperty("File"), PipelineFileValue.Owner(id, "File")));
    }

    [Fact]
    public async Task DraftNodeDeletion_UsesSharedEntityDeletionEvent()
    {
        var id = Guid.NewGuid();
        await Save(Item(id, new { File = new { assetId = Guid.NewGuid(), originalName = "deleted.txt" } }));
        var result = await Saver().HandleAsync(new(_pipeline.Id, [], []), CancellationToken.None);
        Assert.True(result.IsSuccess);
        Assert.Contains(new EntityDeletedMessage("PipelineNode", id.ToString()), _deleted);
        Assert.Single(_links);
    }

    [Fact]
    public async Task DeletionPublicationFailure_DoesNotCrashSavingAndStillSaves()
    {
        var id = Guid.NewGuid();
        await Save(Item(id, new { File = new { assetId = Guid.NewGuid(), originalName = "keep.txt" } }));
        _bus.PublishAsync(Arg.Any<EntityDeletedMessage>(), Arg.Any<DeliveryOptions>())
            .Returns(_ => throw new InvalidOperationException("Outbox unavailable."));
        var result = await Saver().HandleAsync(new(_pipeline.Id, [], []), CancellationToken.None);
        Assert.True(result.IsSuccess);
        _db.ChangeTracker.Clear();
        Assert.Empty(await _db.PipelineNodes.ToListAsync());
        Assert.Single(_links);
    }

    [Fact]
    public async Task MissingSecondLink_DoesNotHideAvailableFilename()
    {
        var id = Guid.NewGuid();
        var saved = await Save(Item(id, new { File = new { assetId = Guid.NewGuid(), originalName = "available.txt" } }));
        var fileId = saved.Nodes.Single().FileAssets!["File"].AssetLinkId;
        var node = await _db.PipelineNodes.SingleAsync();
        node.UpdateConfig(JsonSerializer.SerializeToDocument(new
        {
            File = new { assetLinkId = fileId }, Other = new { assetLinkId = Guid.NewGuid() }
        }));
        var dto = await _builder.BuildDtoAsync(_pipeline);
        Assert.Equal("available.txt", dto.Nodes.Single().FileAssets!["File"].OriginalName);
        Assert.Equal("Unavailable", dto.Nodes.Single().FileAssets!["Other"].Status);
    }

    [Fact]
    public async Task RuntimeCustomFilePin_ResolvesLinkAndLeavesEntityGuidUntouched()
    {
        var nodeId = Guid.NewGuid();
        var entityId = Guid.NewGuid();
        await Save(Item(nodeId, new { File = new { assetId = Guid.NewGuid(), originalName = "runtime.txt" }, EntityId = entityId }));
        var graph = new PipelineGraphProvider(_db);
        graph.RegisterPipeline(_pipeline);
        var execution = new PipelineExecution(_pipeline.Id);
        graph.RegisterExecution(execution);
        var memory = Substitute.For<IExecutionMemoryStore>();
        var tools = new EmptyTools();
        var resolver = new PinValueResolver(graph, memory, tools,
            new PureNodeResolver(tools, memory, graph, NullLogger<PureNodeResolver>.Instance),
            new AssetResolver(_assets, NullLogger<AssetResolver>.Instance), NullLogger<PinValueResolver>.Instance);
        var file = PipelineFileValue.AsJson(await resolver.ResolvePinAsync(execution.Id, nodeId, "File"));
        Assert.Equal("runtime.txt", file.GetProperty("$file").GetProperty("filename").GetString());
        Assert.Equal(entityId.ToString(), PipelineFileValue.AsJson(await resolver.ResolvePinAsync(execution.Id, nodeId, "EntityId")).GetString());
    }

    private BatchUpsertCustomNodesHandler ScriptSaver() => new(_db, _assets, _bus, NullLogger<BatchUpsertCustomNodesHandler>.Instance);
    private BatchUpsertItem ScriptItem(string key, Guid? assetId, string filename = "stored.py", string? hash = null) =>
        new(key, key, key, "python", hash ?? new string('a', 64), filename, assetId, [], []);

    [Fact]
    public async Task ScriptPublish_RequiresAssetAndReportsPartialBatch()
    {
        var result = await ScriptSaver().HandleAsync(new(_pipeline.ProjectId,
            [ScriptItem("first", Guid.NewGuid()), ScriptItem("second", null)]), CancellationToken.None);
        Assert.True(result.IsSuccess);
        Assert.Single(result.Value.Errors);
        Assert.Equal("first", result.Value.Results.Single().Key);
        Assert.Single(_links);
        Assert.Equal(2, await _db.NodeDefinitions.CountAsync());
    }

    [Fact]
    public async Task ScriptPublish_HashMismatchPreservesPreviousDefinition()
    {
        await ScriptSaver().HandleAsync(new(_pipeline.ProjectId, [ScriptItem("custom", Guid.NewGuid())]), CancellationToken.None);
        var previous = await _db.NodeDefinitions.SingleAsync(x => x.Key == "custom");
        var previousHash = previous.ContentHash;
        var previousId = Assert.Single(_links).Key;
        var result = await ScriptSaver().HandleAsync(new(_pipeline.ProjectId,
            [ScriptItem("custom", Guid.NewGuid(), "new.py", new string('b', 64))]), CancellationToken.None);
        Assert.Single(result.Value.Errors);
        Assert.Equal(previousHash, (await _db.NodeDefinitions.SingleAsync(x => x.Key == "custom")).ContentHash);
        Assert.Contains(previousId, _links.Keys);
        Assert.Single(_links);
    }

    [Fact]
    public async Task ScriptCreateReloadAndReplace_KeepFilenameAndExactPk()
    {
        var created = await new CreateCustomNodeHandler(_db, _assets)
            .HandleAsync(new(_pipeline.ProjectId, "custom", null, "python", Guid.NewGuid(), "original.py", [], []), CancellationToken.None);
        Assert.True(created.IsSuccess);
        var first = created.Value.ScriptAssetLinkId!.Value;
        var query = await new GetCustomNodeByIdHandler(_db, _assets).HandleAsync(new(created.Value.Id), CancellationToken.None);
        Assert.Equal("original.py", query.Value.OriginalFileName);
        Assert.Equal(new string('a', 64), query.Value.ContentHash);
        var updated = await new UpdateCustomNodeHandler(_db, _assets, _bus)
            .HandleAsync(new(created.Value.Id, "custom", null, "python", Guid.NewGuid(), "replacement.py", [], []), CancellationToken.None);
        Assert.True(updated.IsSuccess);
        Assert.NotEqual(first, updated.Value.ScriptAssetLinkId);
        Assert.DoesNotContain(first, _links.Keys);
        Assert.Equal("replacement.py", (await new GetCustomNodeByIdHandler(_db, _assets)
            .HandleAsync(new(created.Value.Id), CancellationToken.None)).Value.OriginalFileName);
    }

    public void Dispose() { _db.Dispose(); _connection.Dispose(); }

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
