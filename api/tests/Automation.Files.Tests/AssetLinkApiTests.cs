using Automation.Files.Contracts;
using Automation.Files.Domain.Entities;
using Automation.Files.Infrastructure;
using Automation.Files.Infrastructure.Persistence;
using Automation.Files.Infrastructure.Storage;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;
using Automation.Files.Features.Assets;
using Automation.SharedKernel.Domain.Events;
using Microsoft.Extensions.Logging.Abstractions;

namespace Automation.Files.Tests;

public sealed class AssetLinkApiTests : IDisposable
{
    private readonly SqliteConnection _connection = new("Data Source=:memory:");
    private readonly FilesDbContext _db;
    private readonly AssetApiService _api;
    private readonly AssetLinkOwner _owner = new("PipelineNode", "node-1", "NodeConfig/preset");

    public AssetLinkApiTests()
    {
        _connection.Open();
        _connection.CreateCollation("case_insensitive", (a, b) => string.Compare(a, b, StringComparison.OrdinalIgnoreCase));
        _db = new FilesDbContext(new DbContextOptionsBuilder<FilesDbContext>().UseSqlite(_connection).Options);
        _db.Database.EnsureCreated();
        var storage = Substitute.For<IObjectStorageService>();
        storage.GetPublicUrl(Arg.Any<string>()).Returns(x => "https://storage.example/" + x.Arg<string>());
        var registry = new AssetRegistry([
            new RegisteredAssetSlot("PipelineNode", "NodeConfig", new AssetCategoryOptions
            {
                AllowMultiple = true, AllowSubSlots = true, MaxSizeBytes = 100,
                AllowedContentTypes = ["text/plain"]
            }),
            new RegisteredAssetSlot("NodeDefinition", "CustomScript", new AssetCategoryOptions()),
            new RegisteredAssetSlot("PipelineNode", "Limited", new AssetCategoryOptions
            {
                AllowMultiple = true, MaxCount = 1
            })
        ]);
        _api = new AssetApiService(_db, storage, registry);
    }

    private async Task<Asset> SeedAsset(bool confirmed = true, long size = 10, string contentType = "text/plain")
    {
        var asset = new Asset(Guid.NewGuid().ToString(), size, contentType, ".txt", Guid.NewGuid().ToString("N"));
        if (confirmed) asset.MarkAsConfirmed();
        _db.Assets.Add(asset);
        await _db.SaveChangesAsync();
        return asset;
    }

    [Fact]
    public async Task SameAssetWithDifferentNames_IsResolvedAndDeletedByLinkPk()
    {
        var asset = await SeedAsset();
        var first = await _api.CreateLinkAsync(new(asset.Id, "first.txt"), _owner);
        var second = await _api.CreateLinkAsync(new(asset.Id, "second.txt"), _owner);
        Assert.True(first.IsSuccess);
        Assert.True(second.IsSuccess);
        Assert.NotEqual(first.Value.AssetLinkId, second.Value.AssetLinkId);
        _db.ChangeTracker.Clear();
        var result = await _api.GetLinksByIdsAsync([
            new(second.Value.AssetLinkId, _owner), new(first.Value.AssetLinkId, _owner)
        ]);
        Assert.True(result.IsSuccess);
        Assert.Equal(new[] { "second.txt", "first.txt" }, result.Value.Select(x => x.OriginalName));
        Assert.All(result.Value, x => Assert.Equal(asset.HashSha256, x.HashSha256));
        Assert.All(result.Value, x => Assert.Equal(asset.Id, x.AssetId));
        Assert.True((await _api.RemoveLinkByIdAsync(new(first.Value.AssetLinkId, _owner))).IsSuccess);
        Assert.True((await _api.RemoveLinkByIdAsync(new(first.Value.AssetLinkId, _owner))).IsSuccess);
        Assert.Equal(second.Value.AssetLinkId, (await _db.AssetLinks.SingleAsync()).Id);
        Assert.Equal(asset.Id, (await _db.Assets.SingleAsync()).Id);
    }

    [Theory]
    [InlineData("OtherNode", "node-1", "NodeConfig/preset")]
    [InlineData("PipelineNode", "node-2", "NodeConfig/preset")]
    [InlineData("PipelineNode", "node-1", "NodeConfig/other")]
    public async Task WrongOwnerOrSlot_CannotReadOrDelete(string type, string id, string slot)
    {
        var asset = await SeedAsset();
        var link = (await _api.CreateLinkAsync(new(asset.Id, "preset.txt"), _owner)).Value;
        var reference = new AssetLinkReference(link.AssetLinkId, new(type, id, slot));
        Assert.True((await _api.GetLinksByIdsAsync([reference])).IsFailed);
        Assert.True((await _api.RemoveLinkByIdAsync(reference)).IsFailed);
        Assert.Equal(1, await _db.AssetLinks.CountAsync());
    }

    [Theory]
    [InlineData(false, 10, "text/plain")]
    [InlineData(true, 101, "text/plain")]
    [InlineData(true, 10, "image/png")]
    public async Task InvalidAsset_IsNotLinked(bool confirmed, long size, string contentType)
    {
        var asset = await SeedAsset(confirmed, size, contentType);
        Assert.True((await _api.CreateLinkAsync(new(asset.Id, "preset.txt"), _owner)).IsFailed);
        Assert.Empty(await _db.AssetLinks.ToListAsync());
    }

    [Fact]
    public async Task MissingLinkInBatch_FailsInsteadOfReturningPartialResults()
    {
        var asset = await SeedAsset();
        var link = (await _api.CreateLinkAsync(new(asset.Id, "preset.txt"), _owner)).Value;
        Assert.True((await _api.GetLinksByIdsAsync([
            new(link.AssetLinkId, _owner), new(Guid.NewGuid(), _owner)
        ])).IsFailed);
        Assert.Empty((await _api.GetLinksByIdsAsync([])).Value);
    }

    [Fact]
    public async Task EntityDeletion_CutsAllOwnerLinksAndLeavesAssetsForOrphanJob()
    {
        var asset = await SeedAsset();
        await _api.CreateLinkAsync(new(asset.Id, "one.txt"), _owner);
        await _api.CreateLinkAsync(new(asset.Id, "two.txt"), _owner with { SlotKey = "NodeConfig/other" });
        var retained = (await _api.CreateLinkAsync(new(asset.Id, "keep.txt"), _owner with { EntityId = "node-2" })).Value;
        var handler = new EntityDeletedHandler(_db, NullLogger<EntityDeletedHandler>.Instance);
        var message = new EntityDeletedMessage(_owner.EntityType, _owner.EntityId);
        await handler.HandleAsync(message, CancellationToken.None);
        await handler.HandleAsync(message, CancellationToken.None);
        Assert.Equal(retained.AssetLinkId, (await _db.AssetLinks.SingleAsync()).Id);
        Assert.Equal(asset.Id, (await _db.Assets.SingleAsync()).Id);
    }

    [Fact]
    public async Task DisplayLookup_ReturnsOnlyConfirmedLinksWithMatchingOwners()
    {
        var asset = await SeedAsset();
        var link = (await _api.CreateLinkAsync(new(asset.Id, "visible.txt"), _owner)).Value;
        var other = (await _api.CreateLinkAsync(new(asset.Id, "private.txt"), _owner)).Value;
        var found = await _api.FindLinksByIdsAsync([
            new(link.AssetLinkId, _owner), new(Guid.NewGuid(), _owner),
            new(other.AssetLinkId, _owner with { EntityId = "another-node" })
        ]);
        Assert.True(found.IsSuccess);
        Assert.Equal("visible.txt", Assert.Single(found.Value).OriginalName);
        Assert.Empty((await _api.FindLinksByIdsAsync([])).Value);
    }

    [Fact]
    public async Task SingleFileSlot_PreservesExistingLinkWhenCreateFails()
    {
        var asset = await SeedAsset();
        var owner = new AssetLinkOwner("NodeDefinition", "definition-1", "CustomScript");
        var first = await _api.CreateLinkAsync(new(asset.Id, "first.py"), owner);
        Assert.True(first.IsSuccess);
        Assert.True((await _api.CreateLinkAsync(new(asset.Id, "second.py"), owner)).IsFailed);
        Assert.Equal(first.Value.AssetLinkId, (await _db.AssetLinks.SingleAsync()).Id);
    }

    [Fact]
    public async Task SubSlots_RequireExplicitRegistrationOptIn()
    {
        var asset = await SeedAsset();
        Assert.True((await _api.CreateLinkAsync(new(asset.Id, "script.py"),
            new("NodeDefinition", "definition-1", "CustomScript/other"))).IsFailed);
        Assert.True((await _api.CreateLinkAsync(new(Guid.NewGuid(), "missing.txt"), _owner)).IsFailed);
        Assert.True((await _api.CreateLinkAsync(new(asset.Id, ""), _owner)).IsFailed);
        Assert.True((await _api.CreateLinkAsync(new(asset.Id, "preset.txt"), _owner, -1)).IsFailed);
        Assert.Empty(await _db.AssetLinks.ToListAsync());
    }

    [Fact]
    public async Task SyncLinks_ReusesExactMatchWithinBatchAndOnRetry()
    {
        var asset = await SeedAsset();
        var item = new AssetLinkSyncItem(_owner, new(asset.Id, "preset.txt"));
        var first = await _api.SyncLinksAsync([item, item]);
        Assert.All(first, x => Assert.True(x.IsSuccess));
        Assert.Equal(first[0].Link!.AssetLinkId, first[1].Link!.AssetLinkId);
        _db.ChangeTracker.Clear();
        var retry = Assert.Single(await _api.SyncLinksAsync([item]));
        Assert.Equal(first[0].Link!.AssetLinkId, retry.Link!.AssetLinkId);
        Assert.Single(await _db.AssetLinks.ToListAsync());
    }

    [Fact]
    public async Task SyncLinks_KeepsNamesOwnersAndPinsIndependent()
    {
        var asset = await SeedAsset();
        var old = (await _api.CreateLinkAsync(new(asset.Id, "old.txt"), _owner)).Value;
        var results = await _api.SyncLinksAsync([
            new(_owner, new(asset.Id, "new.txt")),
            new(_owner with { EntityId = "node-2" }, new(asset.Id, "new.txt")),
            new(_owner with { SlotKey = "NodeConfig/other" }, new(asset.Id, "new.txt")),
            new(_owner, AssetLinkId: old.AssetLinkId)
        ]);
        Assert.All(results, x => Assert.True(x.IsSuccess));
        Assert.Equal(4, results.Select(x => x.Link!.AssetLinkId).Distinct().Count());
        Assert.Equal(old.AssetLinkId, results[3].Link!.AssetLinkId);
        Assert.Equal(4, await _db.AssetLinks.CountAsync());
    }

    [Fact]
    public async Task SyncLinks_ReturnsValidationErrorsPerItemAndSavesValidItems()
    {
        var valid = await SeedAsset();
        var pending = await SeedAsset(confirmed: false);
        var large = await SeedAsset(size: 101);
        var image = await SeedAsset(contentType: "image/png");
        var results = await _api.SyncLinksAsync([
            new(_owner, new(pending.Id, "pending.txt")),
            new(_owner, new(valid.Id, "valid.txt")),
            new(_owner, new(large.Id, "large.txt")),
            new(_owner, new(image.Id, "image.png")),
            new(_owner, new(Guid.NewGuid(), "missing.txt")),
            new(_owner with { SlotKey = "Unknown" }, new(valid.Id, "wrong.txt")),
            new(_owner, new(valid.Id, "")),
            new(_owner, new(valid.Id, "ambiguous.txt"), Guid.NewGuid())
        ]);
        Assert.Equal(new string?[] {
            "AssetUnconfirmed", null, "FileTooLarge", "ContentTypeNotAllowed",
            "AssetNotFound", "InvalidSlot", "InvalidRequest", "InvalidRequest"
        }, results.Select(x => x.ErrorCode));
        Assert.All(results.Where(x => !x.IsSuccess), x => {
            Assert.Null(x.Link);
            Assert.False(string.IsNullOrWhiteSpace(x.ErrorMessage));
        });
        Assert.Equal(results[1].Link!.AssetLinkId, (await _db.AssetLinks.SingleAsync()).Id);
    }

    [Theory]
    [InlineData("PipelineNode", "node-2", "NodeConfig/preset")]
    [InlineData("PipelineNode", "node-1", "NodeConfig/other")]
    [InlineData("NodeDefinition", "node-1", "CustomScript")]
    public async Task SyncLinks_RejectsRetainedLinkFromAnotherOwnerOrSlot(string type, string id, string slot)
    {
        var asset = await SeedAsset();
        var link = (await _api.CreateLinkAsync(new(asset.Id, "private.txt"), _owner)).Value;
        var result = Assert.Single(await _api.SyncLinksAsync([
            new(new(type, id, slot), AssetLinkId: link.AssetLinkId)
        ]));
        Assert.Equal("LinkNotFound", result.ErrorCode);
        Assert.Null(result.Link);
        Assert.Equal(link.AssetLinkId, (await _db.AssetLinks.SingleAsync()).Id);
    }

    [Theory]
    [InlineData("NodeDefinition", "CustomScript")]
    [InlineData("PipelineNode", "Limited")]
    public async Task SyncLinks_EnforcesSlotLimitIncludingEarlierBatchItems(string type, string slot)
    {
        var asset = await SeedAsset();
        var owner = new AssetLinkOwner(type, "owner-1", slot);
        var results = await _api.SyncLinksAsync([
            new(owner, new(asset.Id, "first.txt")),
            new(owner, new(asset.Id, "second.txt")),
            new(owner, new(asset.Id, "first.txt"))
        ]);
        Assert.True(results[0].IsSuccess);
        Assert.Equal("SlotFull", results[1].ErrorCode);
        Assert.Equal(results[0].Link!.AssetLinkId, results[2].Link!.AssetLinkId);
        var retry = Assert.Single(await _api.SyncLinksAsync([new(owner, new(asset.Id, "first.txt"))]));
        Assert.True(retry.IsSuccess);
        Assert.Equal(results[0].Link!.AssetLinkId, (await _db.AssetLinks.SingleAsync()).Id);
    }

    [Fact]
    public async Task SyncLinks_EmptyBatchAndClearPreserveExistingLinks()
    {
        var asset = await SeedAsset();
        var link = (await _api.CreateLinkAsync(new(asset.Id, "keep.txt"), _owner)).Value;
        Assert.Empty(await _api.SyncLinksAsync([]));
        var result = Assert.Single(await _api.SyncLinksAsync([new(_owner)]));
        Assert.True(result.IsSuccess);
        Assert.Null(result.Link);
        Assert.Equal(link.AssetLinkId, (await _db.AssetLinks.SingleAsync()).Id);
    }

    [Fact]
    public async Task SyncLinks_DatabaseFailureThrowsAndDoesNotLeavePendingInserts()
    {
        var asset = await SeedAsset();
        var interceptor = new FailSyncSaveInterceptor();
        await using var db = new FilesDbContext(new DbContextOptionsBuilder<FilesDbContext>()
            .UseSqlite(_connection).AddInterceptors(interceptor).Options);
        var storage = Substitute.For<IObjectStorageService>();
        var api = new AssetApiService(db, storage, new AssetRegistry([
            new RegisteredAssetSlot("PipelineNode", "NodeConfig", new AssetCategoryOptions
            {
                AllowMultiple = true, AllowSubSlots = true
            })
        ]));
        var item = new AssetLinkSyncItem(_owner, new(asset.Id, "retry.txt"));
        await Assert.ThrowsAsync<DbUpdateException>(() => api.SyncLinksAsync([item]));
        Assert.DoesNotContain(db.ChangeTracker.Entries(), x => x.State == EntityState.Added);
        Assert.Empty(await _db.AssetLinks.ToListAsync());
        interceptor.Fail = false;
        var result = Assert.Single(await api.SyncLinksAsync([item]));
        Assert.True(result.IsSuccess);
        Assert.Equal(result.Link!.AssetLinkId, (await _db.AssetLinks.SingleAsync()).Id);
    }

    public sealed class FailSyncSaveInterceptor : Microsoft.EntityFrameworkCore.Diagnostics.SaveChangesInterceptor
    {
        public bool Fail { get; set; } = true;

        public override ValueTask<Microsoft.EntityFrameworkCore.Diagnostics.InterceptionResult<int>> SavingChangesAsync(
            Microsoft.EntityFrameworkCore.Diagnostics.DbContextEventData eventData,
            Microsoft.EntityFrameworkCore.Diagnostics.InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            if (Fail) throw new DbUpdateException("Simulated database failure.");
            return ValueTask.FromResult(result);
        }
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }
}
