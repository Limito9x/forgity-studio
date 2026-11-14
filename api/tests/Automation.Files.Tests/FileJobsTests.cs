using Automation.Files.Domain.Entities;
using Automation.Files.Infrastructure.Persistence;
using Automation.Files.Infrastructure.Storage;
using Automation.Files.Jobs;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace Automation.Files.Tests;

public sealed class FileJobsTests : IDisposable
{
    private readonly SqliteConnection _connection = new("Data Source=:memory:");
    private readonly FilesDbContext _db;
    private readonly IStorageServiceFactory _storageFactory;
    private readonly IObjectStorageService _defaultStorage;
    private readonly IObjectStorageService _customStorage;

    private class TestFilesDbContext(DbContextOptions<FilesDbContext> options) : FilesDbContext(options)
    {
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            modelBuilder.Entity<Asset>()
                .Property(x => x.CreatedAt)
                .HasConversion(new Microsoft.EntityFrameworkCore.Storage.ValueConversion.DateTimeOffsetToBinaryConverter());
        }
    }

    public FileJobsTests()
    {
        _connection.Open();
        _connection.CreateCollation("case_insensitive", (a, b) => string.Compare(a, b, StringComparison.OrdinalIgnoreCase));
        _db = new TestFilesDbContext(new DbContextOptionsBuilder<FilesDbContext>().UseSqlite(_connection).Options);
        _db.Database.EnsureCreated();

        _defaultStorage = Substitute.For<IObjectStorageService>();
        _customStorage = Substitute.For<IObjectStorageService>();

        _storageFactory = Substitute.For<IStorageServiceFactory>();
        _storageFactory.GetDefaultStorageService().Returns(_defaultStorage);
        _storageFactory.GetStorageServiceAsync(null, Arg.Any<CancellationToken>()).Returns(_defaultStorage);
    }

    [Fact]
    public async Task CleanupOrphanedFiles_DeletesAcrossMultipleStorageProfiles()
    {
        var customProfileId = Guid.NewGuid();
        var customProfile = new StorageProfile(
            studioId: Guid.NewGuid(),
            name: "Custom Storage",
            providerType: Automation.Files.Domain.Enums.StorageProviderType.CustomS3,
            bucketName: "my-bucket",
            serviceUrl: "https://s3.custom.com",
            accessKey: "key",
            secretKey: "secret"
        )
        {
            Id = customProfileId
        };
        _db.StorageProfiles.Add(customProfile);
        await _db.SaveChangesAsync();

        _storageFactory.GetStorageServiceAsync(customProfileId, Arg.Any<CancellationToken>()).Returns(_customStorage);

        // File 1: Default storage, created 25h ago, no links -> Should be deleted
        var asset1 = new Asset(
            hashSha256: "hash1".PadLeft(64, '0'),
            extension: ".png",
            sizeBytes: 1000,
            contentType: "image/png",
            storagePath: "default/path1.png",
            storageProfileId: null
        );
        typeof(Asset).GetProperty("CreatedAt")?.SetValue(asset1, DateTimeOffset.UtcNow.AddHours(-25));

        // File 2: Custom storage, created 25h ago, no links -> Should be deleted on custom storage
        var asset2 = new Asset(
            hashSha256: "hash2".PadLeft(64, '0'),
            extension: ".png",
            sizeBytes: 2000,
            contentType: "image/png",
            storagePath: "custom/path2.png",
            storageProfileId: customProfileId
        );
        typeof(Asset).GetProperty("CreatedAt")?.SetValue(asset2, DateTimeOffset.UtcNow.AddHours(-25));

        // File 3: Linked to an entity -> Should NOT be deleted
        var asset3 = new Asset(
            hashSha256: "hash3".PadLeft(64, '0'),
            extension: ".png",
            sizeBytes: 3000,
            contentType: "image/png",
            storagePath: "default/path3.png",
            storageProfileId: null
        );
        typeof(Asset).GetProperty("CreatedAt")?.SetValue(asset3, DateTimeOffset.UtcNow.AddHours(-25));

        _db.Assets.AddRange(asset1, asset2, asset3);
        await _db.SaveChangesAsync();

        var link = new AssetLink(asset3.Id, "Character", "Avatar", "char-1", "avatar.png");
        _db.AssetLinks.Add(link);
        await _db.SaveChangesAsync();

        var jobs = new FileJobs(_db, _storageFactory, NullLogger<FileJobs>.Instance);
        await jobs.CleanupOrphanedFiles();

        // Kiểm tra gọi Delete trên đúng storage
        await _defaultStorage.Received(1).DeleteFilesAsync(Arg.Is<IReadOnlyCollection<string>>(x => x.Contains("default/path1.png")), Arg.Any<CancellationToken>());
        await _customStorage.Received(1).DeleteFilesAsync(Arg.Is<IReadOnlyCollection<string>>(x => x.Contains("custom/path2.png")), Arg.Any<CancellationToken>());

        // Kiểm tra DB: asset1 và asset2 bị xóa, asset3 vẫn còn
        var remainingAssets = await _db.Assets.ToListAsync();
        Assert.Single(remainingAssets);
        Assert.Equal(asset3.Id, remainingAssets[0].Id);
    }

    [Fact]
    public async Task CleanupUntrackedStorageFiles_OnlyScansDefaultStorage()
    {
        _defaultStorage.GetAllFilesAsync(Arg.Any<CancellationToken>())
            .Returns(new List<string> { "default/tracked.png", "default/ghost.png" });

        var asset = new Asset(
            hashSha256: "tracked".PadLeft(64, '0'),
            extension: ".png",
            sizeBytes: 1000,
            contentType: "image/png",
            storagePath: "default/tracked.png",
            storageProfileId: null
        );
        _db.Assets.Add(asset);
        await _db.SaveChangesAsync();

        var jobs = new FileJobs(_db, _storageFactory, NullLogger<FileJobs>.Instance);
        await jobs.CleanupUntrackedStorageFiles();

        // Chỉ xóa ghost file trên Default Storage
        await _defaultStorage.Received(1).DeleteFilesAsync(
            Arg.Is<IReadOnlyCollection<string>>(x => x.Count == 1 && x.Contains("default/ghost.png")),
            Arg.Any<CancellationToken>()
        );
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }
}
