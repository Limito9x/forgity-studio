using System.Text.Json;
using Automation.Repository.Domain.Entities;
using Automation.Repository.Features.RepositoryRunners;
using Automation.Repository.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Xunit;

namespace Automation.Pipeline.Tests;

public class DetachRunnerFromRepositoryTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly RepositoryDbContext _db;
    private readonly DetachRunnerFromRepositoryHandler _handler;

    public DetachRunnerFromRepositoryTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<RepositoryDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new TestRepositoryDbContext(options);
        _db.Database.EnsureCreated();

        _handler = new DetachRunnerFromRepositoryHandler(_db);
    }

    [Fact]
    public async Task DetachRunner_WhenRunnerNotAttached_ReturnsFailure()
    {
        // Arrange
        var repoId = Guid.NewGuid();
        var runnerId = Guid.NewGuid();

        // Act
        var result = await _handler.HandleAsync(
            new DetachRunnerFromRepositoryCommand(repoId, runnerId),
            CancellationToken.None
        );

        // Assert
        result.IsFailed.Should().BeTrue();
        result.Errors.Should().ContainSingle(e => e.Message.Contains("not attached"));
    }

    [Fact]
    public async Task DetachRunner_WhenRunnerHoldsActiveLock_ReturnsFailureAndBlocks()
    {
        // Arrange
        var repo = new Repository.Domain.Entities.Repository(Guid.NewGuid(), "Test Repo");
        _db.Repositories.Add(repo);

        var runnerId = Guid.NewGuid();
        var repoRunner = new RepositoryRunner(repo.Id, runnerId, @"D:\Projects\Repo");
        _db.RepositoryRunners.Add(repoRunner);

        var resource = new ResourceItem(repo.Id, "Model.fbx", "fbx", "Assets/Model.fbx");
        resource.Lock(runnerId, Guid.NewGuid());
        _db.ResourceItems.Add(resource);

        await _db.SaveChangesAsync();

        // Act
        var result = await _handler.HandleAsync(
            new DetachRunnerFromRepositoryCommand(repo.Id, runnerId),
            CancellationToken.None
        );

        // Assert
        result.IsFailed.Should().BeTrue();
        result.Errors.Should().ContainSingle(e => e.Message.Contains("active file locks"));

        // Verify RepositoryRunner is still in DB
        var exists = await _db.RepositoryRunners.AnyAsync(r => r.Id == repoRunner.Id);
        exists.Should().BeTrue();
    }

    [Fact]
    public async Task DetachRunner_WhenCleanAndIdle_SucceedsAndRemovesRepositoryRunner()
    {
        // Arrange
        var repo = new Repository.Domain.Entities.Repository(Guid.NewGuid(), "Test Repo");
        _db.Repositories.Add(repo);

        var runnerId = Guid.NewGuid();
        var repoRunner = new RepositoryRunner(repo.Id, runnerId, @"D:\Projects\Repo");
        _db.RepositoryRunners.Add(repoRunner);

        await _db.SaveChangesAsync();

        // Act
        var result = await _handler.HandleAsync(
            new DetachRunnerFromRepositoryCommand(repo.Id, runnerId),
            CancellationToken.None
        );

        // Assert
        result.IsSuccess.Should().BeTrue();

        var exists = await _db.RepositoryRunners.AnyAsync(r => r.Id == repoRunner.Id);
        exists.Should().BeFalse();
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    private class TestRepositoryDbContext(DbContextOptions<RepositoryDbContext> options) : RepositoryDbContext(options)
    {
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            foreach (var entityType in modelBuilder.Model.GetEntityTypes())
            {
                entityType.SetSchema(null); // SQLite does not support schemas

                foreach (var prop in entityType.GetProperties())
                {
                    if (prop.ClrType == typeof(JsonDocument))
                    {
                        prop.SetColumnType("TEXT");
                        prop.SetValueConverter(new ValueConverter<JsonDocument?, string?>(
                            v => v != null ? v.RootElement.GetRawText() : null,
                            v => v != null ? JsonDocument.Parse(v, default) : null
                        ));
                    }
                }
            }
        }
    }
}
