using Automation.Files.Contracts;
using Automation.Files.Domain.Entities;
using Automation.Files.Domain.Enums;
using Automation.Files.Features.StorageProfiles;
using Automation.Files.Infrastructure;
using Automation.Files.Infrastructure.Persistence;
using Automation.Files.Infrastructure.Storage;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using Xunit;

namespace Automation.Files.Tests;

public sealed class StorageProfileTests : IDisposable
{
    private readonly SqliteConnection _connection = new("Data Source=:memory:");
    private readonly FilesDbContext _db;

    public StorageProfileTests()
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

    [Fact]
    public async Task CreateStorageProfile_FirstProfile_SetsDefaultAutomatically()
    {
        var handler = new CreateStorageProfileHandler(_db);
        var studioId = Guid.NewGuid();

        var result = await handler.HandleAsync(new CreateStorageProfileCommand(
            StudioId: studioId,
            Name: "Studio Cloud Storage",
            ProviderType: StorageProviderType.StudioCloud,
            BucketName: "studio-assets",
            ServiceUrl: "https://r2.cloudflarestorage.com",
            IsDefault: false
        ), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.True(result.Value.IsDefault, "First profile should automatically become the default");
        Assert.Equal(200L * 1024 * 1024, result.Value.StorageQuotaBytes);
    }

    [Fact]
    public async Task CreateStorageProfile_SecondProfileAsDefault_UnsetsPreviousDefault()
    {
        var handler = new CreateStorageProfileHandler(_db);
        var studioId = Guid.NewGuid();

        var res1 = await handler.HandleAsync(new CreateStorageProfileCommand(
            StudioId: studioId,
            Name: "Profile 1",
            ProviderType: StorageProviderType.StudioCloud,
            BucketName: "bucket-1",
            ServiceUrl: "https://url1.com",
            IsDefault: true
        ), CancellationToken.None);

        var res2 = await handler.HandleAsync(new CreateStorageProfileCommand(
            StudioId: studioId,
            Name: "Profile 2",
            ProviderType: StorageProviderType.CustomS3,
            BucketName: "bucket-2",
            ServiceUrl: "https://s3.amazonaws.com",
            AccessKey: "key",
            SecretKey: "secret",
            IsDefault: true
        ), CancellationToken.None);

        Assert.True(res2.IsSuccess);
        Assert.True(res2.Value.IsDefault);

        var p1 = await _db.StorageProfiles.FindAsync(res1.Value.Id);
        Assert.False(p1!.IsDefault);
    }

    [Fact]
    public async Task UpdateStorageProfile_PreservesSecretKey_WhenNotProvided()
    {
        var storageFactory = Substitute.For<IStorageServiceFactory>();
        var createHandler = new CreateStorageProfileHandler(_db);
        var updateHandler = new UpdateStorageProfileHandler(_db, storageFactory);
        var studioId = Guid.NewGuid();

        var created = await createHandler.HandleAsync(new CreateStorageProfileCommand(
            StudioId: studioId,
            Name: "Custom MinIO",
            ProviderType: StorageProviderType.CustomS3,
            BucketName: "minio-bucket",
            ServiceUrl: "http://localhost:9000",
            AccessKey: "old-key",
            SecretKey: "original-secret"
        ), CancellationToken.None);

        var updated = await updateHandler.HandleAsync(new UpdateStorageProfileCommand(
            Id: created.Value.Id,
            Name: "Renamed MinIO",
            ProviderType: StorageProviderType.CustomS3,
            BucketName: "minio-bucket",
            ServiceUrl: "http://localhost:9000",
            AccessKey: "old-key",
            SecretKey: null // Do not overwrite
        ), CancellationToken.None);

        Assert.True(updated.IsSuccess);
        var profileInDb = await _db.StorageProfiles.FindAsync(created.Value.Id);
        Assert.Equal("original-secret", profileInDb!.SecretKey);
        storageFactory.Received(1).InvalidateCache(created.Value.Id);
    }

    [Fact]
    public async Task DeleteStorageProfile_WhenAssetsLinked_FailsGracefully()
    {
        var storageFactory = Substitute.For<IStorageServiceFactory>();
        var deleteHandler = new DeleteStorageProfileHandler(_db, storageFactory);

        var profile = new StorageProfile(
            Guid.NewGuid(), "Test Profile", StorageProviderType.CustomS3, "bucket", "url", null, "ak", "sk"
        );
        _db.StorageProfiles.Add(profile);

        var asset = new Asset("path/to/file.png", 1024, "image/png", ".png", "hash123", profile.Id);
        _db.Assets.Add(asset);
        await _db.SaveChangesAsync();

        var result = await deleteHandler.HandleAsync(new DeleteStorageProfileCommand(profile.Id), CancellationToken.None);

        Assert.True(result.IsFailed);
        Assert.Contains("assets are currently stored in it", result.Errors[0].Message);
    }

    [Fact]
    public async Task FilesStorageProfileResolver_ResolvesCustomS3_AndReturnsNullForStudioCloud()
    {
        var studioId = Guid.NewGuid();

        var cloudProfile = new StorageProfile(
            studioId, "Cloud", StorageProviderType.StudioCloud, "cloud-b", "cloud-url"
        );
        var customProfile = new StorageProfile(
            studioId, "Custom", StorageProviderType.CustomS3, "custom-b", "custom-url", "us-east-1", "ak", "sk"
        );
        _db.StorageProfiles.AddRange(cloudProfile, customProfile);
        await _db.SaveChangesAsync();

        var serviceProvider = Substitute.For<IServiceProvider>();
        serviceProvider.GetService(typeof(FilesDbContext)).Returns(_db);

        var scope = Substitute.For<IServiceScope>();
        scope.ServiceProvider.Returns(serviceProvider);

        var scopeFactory = Substitute.For<IServiceScopeFactory>();
        scopeFactory.CreateScope().Returns(scope);

        var resolver = new FilesStorageProfileResolver(scopeFactory);

        var cloudResult = await resolver.ResolveProfileAsync(cloudProfile.Id);
        Assert.NotNull(cloudResult);
        Assert.True(cloudResult!.IsStudioCloud, "StudioCloud should return config with IsStudioCloud = true");

        var customResult = await resolver.ResolveProfileAsync(customProfile.Id);
        Assert.NotNull(customResult);
        Assert.False(customResult!.IsStudioCloud);
        Assert.Equal("custom-b", customResult.BucketName);
        Assert.Equal("ak", customResult.AccessKey);
        Assert.Equal("sk", customResult.SecretKey);
    }

    [Fact]
    public async Task RequestUploadAsync_WhenExceedsProfileQuota_FailsWithStorageQuotaError()
    {
        var profile = new StorageProfile(
            Guid.NewGuid(), "Quota Profile", StorageProviderType.CustomS3, "bucket", "url", null, "ak", "sk", null, storageQuotaBytes: 1000
        );
        _db.StorageProfiles.Add(profile);
        await _db.SaveChangesAsync();

        var storage = Substitute.For<IObjectStorageService>();
        var storageFactory = Substitute.For<IStorageServiceFactory>();
        storageFactory.GetStorageServiceAsync(profile.Id, Arg.Any<CancellationToken>()).Returns(storage);
        var registry = new AssetRegistry([]);
        var api = new AssetApiService(_db, storageFactory, registry);

        var request = new List<UploadRequestItemDto>
        {
            new("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", ".png", 2000, "image/png")
        };

        var result = await api.RequestUploadAsync(request, profile.Id);

        Assert.True(result.IsFailed);
        Assert.Contains("Storage quota exceeded", result.Errors[0].Message);
    }

    [Fact]
    public async Task RequestUploadAsync_WhenWithinQuota_GeneratesPresignedUrl()
    {
        var profile = new StorageProfile(
            Guid.NewGuid(), "Within Quota Profile", StorageProviderType.CustomS3, "bucket", "url", null, "ak", "sk", null, storageQuotaBytes: 5000
        );
        _db.StorageProfiles.Add(profile);
        await _db.SaveChangesAsync();

        var storage = Substitute.For<IObjectStorageService>();
        storage.GeneratePresignedUploadUrlAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<TimeSpan>(), Arg.Any<CancellationToken>())
            .Returns("https://s3.example.com/upload-url");
        var storageFactory = Substitute.For<IStorageServiceFactory>();
        storageFactory.GetStorageServiceAsync(profile.Id, Arg.Any<CancellationToken>()).Returns(storage);
        var registry = new AssetRegistry([]);
        var api = new AssetApiService(_db, storageFactory, registry);

        var request = new List<UploadRequestItemDto>
        {
            new("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", ".png", 2000, "image/png")
        };

        var result = await api.RequestUploadAsync(request, profile.Id);

        Assert.True(result.IsSuccess);
        Assert.Single(result.Value);
        Assert.Equal("https://s3.example.com/upload-url", result.Value[0].PresignedUrl);
    }

    [Fact]
    public async Task RequestUploadHandler_WhenProjectIdProvided_ResolvesStorageProfileFromProjectsApi()
    {
        var assetApi = Substitute.For<IAssetApi>();
        var projectsApi = Substitute.For<Automation.Studio.Contracts.IProjectsApi>();

        var projectId = Guid.NewGuid();
        var resolvedProfileId = Guid.NewGuid();

        projectsApi.GetProjectStorageProfileIdAsync(projectId, Arg.Any<CancellationToken>())
            .Returns(resolvedProfileId);

        var handler = new Automation.Files.Features.Assets.RequestUploadHandler(assetApi, projectsApi);

        var items = new List<UploadRequestItemDto>
        {
            new("a".PadLeft(64, '0'), ".png", 1024, "image/png")
        };

        var command = new Automation.Files.Features.Assets.RequestUploadCommand(items, StorageProfileId: null, ProjectId: projectId);

        await handler.HandleAsync(command, CancellationToken.None);

        await projectsApi.Received(1).GetProjectStorageProfileIdAsync(projectId, Arg.Any<CancellationToken>());
        await assetApi.Received(1).RequestUploadAsync(items, resolvedProfileId, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task RequestUploadHandler_WhenStorageProfileIdExplicitlyProvided_DoesNotQueryProjectsApi()
    {
        var assetApi = Substitute.For<IAssetApi>();
        var projectsApi = Substitute.For<Automation.Studio.Contracts.IProjectsApi>();

        var projectId = Guid.NewGuid();
        var explicitProfileId = Guid.NewGuid();

        var handler = new Automation.Files.Features.Assets.RequestUploadHandler(assetApi, projectsApi);

        var items = new List<UploadRequestItemDto>
        {
            new("a".PadLeft(64, '0'), ".png", 1024, "image/png")
        };

        var command = new Automation.Files.Features.Assets.RequestUploadCommand(items, StorageProfileId: explicitProfileId, ProjectId: projectId);

        await handler.HandleAsync(command, CancellationToken.None);

        await projectsApi.DidNotReceive().GetProjectStorageProfileIdAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>());
        await assetApi.Received(1).RequestUploadAsync(items, explicitProfileId, Arg.Any<CancellationToken>());
    }
}


