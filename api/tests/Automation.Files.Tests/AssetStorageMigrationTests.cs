using System.Text;
using Automation.Files.Contracts;
using Automation.Files.Domain.Entities;
using Automation.Files.Domain.Enums;
using Automation.Files.Infrastructure;
using Automation.Files.Infrastructure.Persistence;
using Automation.Files.Infrastructure.Storage;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace Automation.Files.Tests;

public sealed class AssetStorageMigrationTests : IDisposable
{
    private readonly SqliteConnection _connection = new("Data Source=:memory:");
    private readonly FilesDbContext _db;
    private readonly IStorageServiceFactory _storageFactory = Substitute.For<IStorageServiceFactory>();
    private readonly IObjectStorageService _sourceStorage = Substitute.For<IObjectStorageService>();
    private readonly IObjectStorageService _targetStorage = Substitute.For<IObjectStorageService>();

    public AssetStorageMigrationTests()
    {
        _connection.Open();
        _connection.CreateCollation("case_insensitive", (a, b) => string.Compare(a, b, StringComparison.OrdinalIgnoreCase));
        _db = new FilesDbContext(new DbContextOptionsBuilder<FilesDbContext>().UseSqlite(_connection).Options);
        _db.Database.EnsureCreated();
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    private AssetApiService CreateService()
    {
        var registry = new AssetRegistry([]);
        return new AssetApiService(_db, _storageFactory, registry);
    }

    private async Task<StorageProfile> CreateProfileAsync(string name)
    {
        var profile = new StorageProfile(
            studioId: Guid.NewGuid(),
            name: name,
            providerType: StorageProviderType.CustomS3,
            bucketName: $"bucket-{name.ToLowerInvariant()}",
            serviceUrl: "https://s3.example.com"
        );
        _db.StorageProfiles.Add(profile);
        await _db.SaveChangesAsync();
        return profile;
    }

    [Fact]
    public async Task MigrateAssetsStorageAsync_SameStorageProfile_ReturnsDeduplicatedWithoutTransfer()
    {
        var profile = await CreateProfileAsync("ProfileSame");
        var asset = new Asset("assets/test1.fbx", 1024, "application/octet-stream", ".fbx", "sha256_sample_1", profile.Id);
        asset.MarkAsConfirmed();
        _db.Assets.Add(asset);
        await _db.SaveChangesAsync();

        var service = CreateService();

        var result = await service.MigrateAssetsStorageAsync(
            [new MigrateAssetItem(asset.Id, DeleteSource: false)],
            targetStorageProfileId: profile.Id
        );

        Assert.True(result.IsSuccess);
        Assert.Single(result.Value);
        Assert.True(result.Value[0].IsSuccess);
        Assert.True(result.Value[0].WasDeduplicated);
        Assert.Equal(asset.Id, result.Value[0].MigratedAssetId);

        // Đảm bảo không gọi stream vật lý nào
        await _sourceStorage.DidNotReceive().OpenReadStreamAsync(Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task MigrateAssetsStorageAsync_TargetAlreadyHasSameSha256_ReusesTargetAssetWithZeroByteTransfer()
    {
        var sourceProfile = await CreateProfileAsync("ProfileSrc");
        var targetProfile = await CreateProfileAsync("ProfileDst");

        var sourceAsset = new Asset("assets/source_file.fbx", 2048, "application/octet-stream", ".fbx", "same_sha256_hash", sourceProfile.Id);
        sourceAsset.MarkAsConfirmed();
        var existingTargetAsset = new Asset("assets/existing_target.fbx", 2048, "application/octet-stream", ".fbx", "same_sha256_hash", targetProfile.Id);
        existingTargetAsset.MarkAsConfirmed();

        _db.Assets.AddRange(sourceAsset, existingTargetAsset);
        await _db.SaveChangesAsync();

        _storageFactory.GetStorageServiceAsync(targetProfile.Id, Arg.Any<CancellationToken>())
            .Returns(_targetStorage);

        var service = CreateService();

        var result = await service.MigrateAssetsStorageAsync(
            [new MigrateAssetItem(sourceAsset.Id, DeleteSource: false)],
            targetStorageProfileId: targetProfile.Id
        );

        Assert.True(result.IsSuccess);
        Assert.Single(result.Value);
        Assert.True(result.Value[0].IsSuccess);
        Assert.True(result.Value[0].WasDeduplicated, "CAS Deduplication should trigger when target already has the file hash");
        Assert.Equal(existingTargetAsset.Id, result.Value[0].MigratedAssetId);

        // Không tốn bất kỳ byte transfer nào
        await _sourceStorage.DidNotReceive().OpenReadStreamAsync(Arg.Any<string>(), Arg.Any<CancellationToken>());
        await _targetStorage.DidNotReceive().UploadStreamAsync(Arg.Any<string>(), Arg.Any<Stream>(), Arg.Any<string>(), Arg.Any<long?>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task MigrateAssetsStorageAsync_DifferentStorage_StreamsAndCreatesNewTargetAsset()
    {
        var sourceProfile = await CreateProfileAsync("ProfileSrcStream");
        var targetProfile = await CreateProfileAsync("ProfileDstStream");

        var sourceAsset = new Asset("assets/character.fbx", 5000, "application/octet-stream", ".fbx", "unique_hash_123", sourceProfile.Id);
        sourceAsset.MarkAsConfirmed();
        _db.Assets.Add(sourceAsset);
        await _db.SaveChangesAsync();

        var fakeStream = new MemoryStream(Encoding.UTF8.GetBytes("Fake 3D binary data stream"));
        _storageFactory.GetStorageServiceAsync(sourceProfile.Id, Arg.Any<CancellationToken>())
            .Returns(_sourceStorage);
        _storageFactory.GetStorageServiceAsync(targetProfile.Id, Arg.Any<CancellationToken>())
            .Returns(_targetStorage);

        _sourceStorage.OpenReadStreamAsync(sourceAsset.StoragePath, Arg.Any<CancellationToken>())
            .Returns(fakeStream);

        var service = CreateService();

        var result = await service.MigrateAssetsStorageAsync(
            [new MigrateAssetItem(sourceAsset.Id, DeleteSource: false)],
            targetStorageProfileId: targetProfile.Id
        );

        Assert.True(result.IsSuccess);
        Assert.Single(result.Value);
        var itemResult = result.Value[0];
        Assert.True(itemResult.IsSuccess);
        Assert.False(itemResult.WasDeduplicated);
        Assert.NotNull(itemResult.MigratedAssetId);
        Assert.NotEqual(sourceAsset.Id, itemResult.MigratedAssetId.Value);

        // Kiểm tra stream đã được gọi đúng
        await _sourceStorage.Received(1).OpenReadStreamAsync(sourceAsset.StoragePath, Arg.Any<CancellationToken>());
        await _targetStorage.Received(1).UploadStreamAsync(
            Arg.Is<string>(p => p.StartsWith("assets/")),
            Arg.Any<Stream>(),
            sourceAsset.ContentType,
            sourceAsset.SizeBytes,
            Arg.Any<CancellationToken>()
        );

        // Kiểm tra asset mới được lưu trong DB gắn với targetProfile.Id
        var migratedInDb = await _db.Assets.FindAsync(itemResult.MigratedAssetId.Value);
        Assert.NotNull(migratedInDb);
        Assert.Equal(targetProfile.Id, migratedInDb.StorageProfileId);
        Assert.Equal("unique_hash_123", migratedInDb.HashSha256);
        Assert.True(migratedInDb.IsConfirmed);
    }

    [Fact]
    public async Task MigrateAssetsStorageAsync_DeleteSourceTrue_RemapsLinksAndCleansSource()
    {
        var sourceProfile = await CreateProfileAsync("ProfileSrcMove");
        var targetProfile = await CreateProfileAsync("ProfileDstMove");

        var sourceAsset = new Asset("assets/old_source.fbx", 1000, "application/octet-stream", ".fbx", "hash_move_test", sourceProfile.Id);
        sourceAsset.MarkAsConfirmed();
        _db.Assets.Add(sourceAsset);
        await _db.SaveChangesAsync();

        // Tạo một AssetLink trỏ vào sourceAsset
        var link = new AssetLink(sourceAsset.Id, "Node", "node_123", "MainMesh", "old_source.fbx", 0);
        _db.AssetLinks.Add(link);
        await _db.SaveChangesAsync();

        _storageFactory.GetStorageServiceAsync(sourceProfile.Id, Arg.Any<CancellationToken>())
            .Returns(_sourceStorage);
        _storageFactory.GetStorageServiceAsync(targetProfile.Id, Arg.Any<CancellationToken>())
            .Returns(_targetStorage);
        _sourceStorage.OpenReadStreamAsync(sourceAsset.StoragePath, Arg.Any<CancellationToken>())
            .Returns(new MemoryStream([1, 2, 3]));

        var service = CreateService();

        var result = await service.MigrateAssetsStorageAsync(
            [new MigrateAssetItem(sourceAsset.Id, DeleteSource: true)],
            targetStorageProfileId: targetProfile.Id
        );

        Assert.True(result.IsSuccess);
        var itemResult = result.Value[0];
        Assert.True(itemResult.IsSuccess);

        // Kiểm tra source asset đã bị xóa khỏi DB
        var sourceInDb = await _db.Assets.FindAsync(sourceAsset.Id);
        Assert.Null(sourceInDb);

        // Kiểm tra physical file trên source storage đã được yêu cầu xóa
        await _sourceStorage.Received(1).DeleteAsync(sourceAsset.StoragePath, Arg.Any<CancellationToken>());

        // Kiểm tra AssetLink đã được remap sang target asset mới
        var updatedLink = await _db.AssetLinks.FindAsync(link.Id);
        Assert.NotNull(updatedLink);
        Assert.Equal(itemResult.MigratedAssetId.Value, updatedLink.AssetId);
    }

    [Fact]
    public async Task MigrateAssetsStorageAsync_ReportsProgressViaIProgress()
    {
        var sourceProfile = await CreateProfileAsync("ProfileSrcProg");
        var targetProfile = await CreateProfileAsync("ProfileDstProg");

        var asset1 = new Asset("assets/f1.fbx", 1000, "application/octet-stream", ".fbx", "h1", sourceProfile.Id);
        var asset2 = new Asset("assets/f2.fbx", 2000, "application/octet-stream", ".fbx", "h2", sourceProfile.Id);
        asset1.MarkAsConfirmed();
        asset2.MarkAsConfirmed();
        _db.Assets.AddRange(asset1, asset2);
        await _db.SaveChangesAsync();

        _storageFactory.GetStorageServiceAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>())
            .Returns(_targetStorage);
        _targetStorage.OpenReadStreamAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(_ => new MemoryStream([1, 2, 3]));

        var progressReports = new List<StorageMigrationProgress>();
        var progressMock = Substitute.For<IProgress<StorageMigrationProgress>>();
        progressMock.When(p => p.Report(Arg.Any<StorageMigrationProgress>()))
            .Do(call => progressReports.Add(call.Arg<StorageMigrationProgress>()));

        var service = CreateService();

        var result = await service.MigrateAssetsStorageAsync(
            [new MigrateAssetItem(asset1.Id), new MigrateAssetItem(asset2.Id)],
            targetStorageProfileId: targetProfile.Id,
            progress: progressMock
        );

        Assert.True(result.IsSuccess);
        Assert.Equal(2, progressReports.Count);
        Assert.Equal(50.0, progressReports[0].Percentage);
        Assert.Equal(100.0, progressReports[1].Percentage);
        Assert.Equal(2, progressReports[1].ProcessedItems);
    }
}
