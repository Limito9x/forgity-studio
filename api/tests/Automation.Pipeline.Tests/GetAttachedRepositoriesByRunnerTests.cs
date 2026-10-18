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

public class GetAttachedRepositoriesByRunnerTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly RepositoryDbContext _db;
    private readonly GetAttachedRepositoriesByRunnerHandler _handler;

    public GetAttachedRepositoriesByRunnerTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<RepositoryDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new TestRepositoryDbContext(options);
        _db.Database.EnsureCreated();

        _handler = new GetAttachedRepositoriesByRunnerHandler(_db);
    }

    [Fact]
    public async Task GetAttachedRepositories_WhenNoRepositories_ReturnsEmptyList()
    {
        // Act
        var result = await _handler.HandleAsync(
            new GetAttachedRepositoriesByRunnerQuery(Guid.NewGuid()),
            CancellationToken.None
        );

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().BeEmpty();
    }

    [Fact]
    public async Task GetAttachedRepositories_WhenAttached_ReturnsRepositoriesWithLockCounts()
    {
        // Arrange
        var runnerId = Guid.NewGuid();
        var projectId = Guid.NewGuid();

        var repo1 = new Repository.Domain.Entities.Repository(projectId, "Characters Repo");
        var repo2 = new Repository.Domain.Entities.Repository(projectId, "Environments Repo");
        _db.Repositories.AddRange(repo1, repo2);

        var attachment1 = new RepositoryRunner(repo1.Id, runnerId, @"D:\Projects\SciFi\Characters");
        var attachment2 = new RepositoryRunner(repo2.Id, runnerId, @"D:\Projects\SciFi\Environments");
        _db.RepositoryRunners.AddRange(attachment1, attachment2);

        // Add 1 locked file in repo1 by this runner
        var lockedItem = new ResourceItem(repo1.Id, "Hero.blend", ".blend", "characters/hero.blend")
        {
            LockedByRunnerId = runnerId,
            LockedAt = DateTimeOffset.UtcNow
        };
        _db.ResourceItems.Add(lockedItem);

        await _db.SaveChangesAsync();

        // Act
        var result = await _handler.HandleAsync(
            new GetAttachedRepositoriesByRunnerQuery(runnerId),
            CancellationToken.None
        );

        // Assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().HaveCount(2);

        var res1 = result.Value.First(x => x.RepositoryId == repo1.Id);
        res1.RepositoryName.Should().Be("Characters Repo");
        res1.MountPath.Should().Be(@"D:\Projects\SciFi\Characters");
        res1.ActiveLocksCount.Should().Be(1);

        var res2 = result.Value.First(x => x.RepositoryId == repo2.Id);
        res2.RepositoryName.Should().Be("Environments Repo");
        res2.ActiveLocksCount.Should().Be(0);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    private class TestRepositoryDbContext(DbContextOptions<RepositoryDbContext> options)
        : RepositoryDbContext(options)
    {
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            foreach (var entityType in modelBuilder.Model.GetEntityTypes())
            {
                entityType.SetSchema(null);

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
                    if (prop.ClrType == typeof(List<string>))
                    {
                        prop.SetColumnType("TEXT");
                        prop.SetValueConverter(new ValueConverter<List<string>?, string?>(
                            v => v != null ? JsonSerializer.Serialize(v, (JsonSerializerOptions?)null) : null,
                            v => v != null ? JsonSerializer.Deserialize<List<string>>(v, (JsonSerializerOptions?)null) ?? new List<string>() : new List<string>()
                        ));
                    }
                }
            }
        }
    }
}
