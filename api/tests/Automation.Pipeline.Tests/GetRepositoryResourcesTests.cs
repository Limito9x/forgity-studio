using System.Text.Json;
using Automation.Content.Contracts;
using Automation.Repository.Domain.Entities;
using Automation.Repository.Features.Resources;
using Automation.Repository.Infrastructure.Persistence;
using Automation.Runner.Contracts;
using FluentAssertions;
using FluentResults;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using NSubstitute;
using Xunit;

namespace Automation.Pipeline.Tests;

public class GetRepositoryResourcesTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly RepositoryDbContext _db;
    private readonly IContentApi _contentApi;
    private readonly IRunnerApi _runnerApi;
    private readonly GetRepositoryResourcesHandler _handler;

    private readonly Guid _projectId = Guid.NewGuid();
    private readonly Guid _repositoryId = Guid.NewGuid();

    public GetRepositoryResourcesTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<RepositoryDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new TestRepositoryDbContext(options);
        _db.Database.EnsureCreated();

        // Seed repository
        var repo = new Automation.Repository.Domain.Entities.Repository(_projectId, "TestRepo") { Id = _repositoryId };
        _db.Repositories.Add(repo);
        _db.SaveChanges();

        _contentApi = Substitute.For<IContentApi>();
        _runnerApi = Substitute.For<IRunnerApi>();

        // Default empty runners map
        _runnerApi.GetAgentsMapByIdsAsync(Arg.Any<IEnumerable<Guid>>(), Arg.Any<CancellationToken>())
            .Returns(Result.Ok<IReadOnlyDictionary<Guid, RunnerDto>>(new Dictionary<Guid, RunnerDto>()));

        // Default empty project contents
        _contentApi.GetContentsByProjectIdAsync(_projectId, Arg.Any<CancellationToken>())
            .Returns(Result.Ok<IReadOnlyDictionary<Guid, ContentSummaryDto>>(new Dictionary<Guid, ContentSummaryDto>()));

        // Default empty anchor links
        _contentApi.GetResourceAnchorLinksAsync(Arg.Any<IEnumerable<Guid>>(), Arg.Any<CancellationToken>())
            .Returns(Result.Ok<IReadOnlyDictionary<Guid, IReadOnlyList<ContentAnchorLinkDto>>>(new Dictionary<Guid, IReadOnlyList<ContentAnchorLinkDto>>()));

        _handler = new GetRepositoryResourcesHandler(_db, _contentApi, _runnerApi);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    [Fact]
    public async Task HandleAsync_WhenMultipleAnchorsExist_PopulatesLinkedAnchorsArray()
    {
        // Arrange: Seed 1 Resource in DB
        var resource = new ResourceItem(_repositoryId, "Boots_Combat.fbx", ".fbx", "meshes/Boots_Combat.fbx");
        _db.ResourceItems.Add(resource);
        await _db.SaveChangesAsync();

        var evaId = Guid.NewGuid();
        var miaId = Guid.NewGuid();
        var charTypeId = Guid.NewGuid();

        // Mock project contents: Guid Id, string Name, Guid ContentTypeId, string ContentTypeName, string? ContentTypeColor, string? ContentTypeIcon
        var contentMap = new Dictionary<Guid, ContentSummaryDto>
        {
            [evaId] = new(evaId, "Eva", charTypeId, "Character", "#ff007f", "user"),
            [miaId] = new(miaId, "Mia", charTypeId, "Character", "#00aaff", "user")
        };
        _contentApi.GetContentsByProjectIdAsync(_projectId, Arg.Any<CancellationToken>())
            .Returns(Result.Ok<IReadOnlyDictionary<Guid, ContentSummaryDto>>(contentMap));

        // Mock anchor links: resource is linked to both Eva and Mia
        var anchorLinksMap = new Dictionary<Guid, IReadOnlyList<ContentAnchorLinkDto>>
        {
            [resource.Id] = new List<ContentAnchorLinkDto>
            {
                new(Guid.NewGuid(), evaId, "Eva", "outfit/boots", 0, resource.Id, "Boots_Combat.fbx", null),
                new(Guid.NewGuid(), miaId, "Mia", "outfit/boots", 0, resource.Id, "Boots_Combat.fbx", null)
            }
        };
        _contentApi.GetResourceAnchorLinksAsync(Arg.Any<IEnumerable<Guid>>(), Arg.Any<CancellationToken>())
            .Returns(Result.Ok<IReadOnlyDictionary<Guid, IReadOnlyList<ContentAnchorLinkDto>>>(anchorLinksMap));

        var query = new GetRepositoryResourcesQuery
        {
            RepositoryId = _repositoryId,
            ProjectId = _projectId,
            Page = 1,
            PageSize = 20
        };

        // Act
        var result = await _handler.HandleAsync(query, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        var items = result.Value.Items.ToList();
        items.Should().HaveCount(1);

        var item = items[0];
        item.Id.Should().Be(resource.Id);
        item.ContentId.Should().Be(evaId); // Backward compatible primary link
        item.ContentName.Should().Be("Eva");
        item.AnchorPath.Should().Be("outfit/boots");

        // Verify N-N LinkedAnchors
        item.LinkedAnchors.Should().NotBeNull();
        item.LinkedAnchors.Should().HaveCount(2);

        item.LinkedAnchors![0].ContentItemId.Should().Be(evaId);
        item.LinkedAnchors[0].ContentItemName.Should().Be("Eva");
        item.LinkedAnchors[0].ContentTypeName.Should().Be("Character");
        item.LinkedAnchors[0].ContentTypeColor.Should().Be("#ff007f");
        item.LinkedAnchors[0].AnchorPath.Should().Be("outfit/boots");

        item.LinkedAnchors[1].ContentItemId.Should().Be(miaId);
        item.LinkedAnchors[1].ContentItemName.Should().Be("Mia");
        item.LinkedAnchors[1].ContentTypeColor.Should().Be("#00aaff");
    }

    [Fact]
    public async Task HandleAsync_WhenFilteringByContentId_ReturnsOnlyMatchedResources()
    {
        // Arrange: Seed 2 Resources in DB
        var res1 = new ResourceItem(_repositoryId, "Eva_Hair.fbx", ".fbx", "Eva_Hair.fbx");
        var res2 = new ResourceItem(_repositoryId, "Mia_Hair.fbx", ".fbx", "Mia_Hair.fbx");
        _db.ResourceItems.AddRange(res1, res2);
        await _db.SaveChangesAsync();

        var evaId = Guid.NewGuid();
        _contentApi.GetLinkedResourceIdsByContentIdAsync(evaId, Arg.Any<CancellationToken>())
            .Returns(Result.Ok<IReadOnlyList<Guid>>(new List<Guid> { res1.Id }));

        var query = new GetRepositoryResourcesQuery
        {
            RepositoryId = _repositoryId,
            ProjectId = _projectId,
            ContentId = evaId,
            Page = 1,
            PageSize = 20
        };

        // Act
        var result = await _handler.HandleAsync(query, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        var items = result.Value.Items.ToList();
        items.Should().HaveCount(1);
        items[0].Id.Should().Be(res1.Id);
    }

    [Fact]
    public async Task HandleAsync_WhenFilteringUnassigned_ReturnsOnlyOrphanResources()
    {
        // Arrange: Seed 2 Resources (1 linked, 1 unassigned)
        var linkedRes = new ResourceItem(_repositoryId, "Assigned.fbx", ".fbx", "Assigned.fbx");
        var orphanRes = new ResourceItem(_repositoryId, "Orphan.fbx", ".fbx", "Orphan.fbx");
        _db.ResourceItems.AddRange(linkedRes, orphanRes);
        await _db.SaveChangesAsync();

        _contentApi.GetAllLinkedResourceIdsInProjectAsync(_projectId, Arg.Any<CancellationToken>())
            .Returns(Result.Ok<IReadOnlyList<Guid>>(new List<Guid> { linkedRes.Id }));

        var query = new GetRepositoryResourcesQuery
        {
            RepositoryId = _repositoryId,
            ProjectId = _projectId,
            IsLinked = false, // Unassigned only
            Page = 1,
            PageSize = 20
        };

        // Act
        var result = await _handler.HandleAsync(query, CancellationToken.None);

        // Assert
        result.IsSuccess.Should().BeTrue();
        var items = result.Value.Items.ToList();
        items.Should().HaveCount(1);
        items[0].Id.Should().Be(orphanRes.Id);
    }

    private class TestRepositoryDbContext(DbContextOptions<RepositoryDbContext> options)
        : RepositoryDbContext(options)
    {
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            foreach (var entity in modelBuilder.Model.GetEntityTypes())
            {
                foreach (var prop in entity.GetProperties())
                {
                    if (prop.ClrType == typeof(DateTimeOffset))
                    {
                        prop.SetValueConverter(new DateTimeOffsetToBinaryConverter());
                    }
                    else if (prop.ClrType == typeof(DateTimeOffset?))
                    {
                        prop.SetValueConverter(new ValueConverter<DateTimeOffset?, long?>(
                            v => v.HasValue ? v.Value.ToUnixTimeMilliseconds() : null,
                            v => v.HasValue ? DateTimeOffset.FromUnixTimeMilliseconds(v.Value) : null
                        ));
                    }
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
