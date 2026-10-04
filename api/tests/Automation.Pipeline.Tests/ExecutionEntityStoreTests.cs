using System.Text.Json;
using Automation.Content.Contracts;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.EntityStore;
using Automation.Pipeline.Engine.StructRegistry.Definitions;
using Automation.Pipeline.Tools;
using Automation.Repository.Contracts;
using FluentAssertions;
using FluentResults;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace Automation.Pipeline.Tests;

public class ExecutionEntityStoreTests
{
    private readonly IRepositoryApi _repositoryApi = Substitute.For<IRepositoryApi>();
    private readonly IContentApi _contentApi = Substitute.For<IContentApi>();
    private readonly ILogger<ExecutionEntityStore> _logger = Substitute.For<ILogger<ExecutionEntityStore>>();
    private readonly ToolExecutionContext _context = new(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

    [Fact]
    public async Task PrefetchResourcesAsync_ShouldFetchFromRepositoryApi_AndIndexByBothIds()
    {
        // Arrange
        var resourceId = Guid.NewGuid();
        var versionId = Guid.NewGuid();
        var contentId = Guid.NewGuid();

        var dto = new ResourceDto(
            ResourceId: resourceId,
            ResourceVersionId: versionId,
            DisplayName: "Warrior_Armor.duf",
            Extension: ".duf",
            RelativePath: "People/Genesis 8 Female/Clothing/Warrior_Armor.duf",
            FileHash: "hash123",
            ContentId: contentId,
            MetadataJson: "{\"type\": \"Armor\"}"
        );

        _repositoryApi.GetResourcesByIdsAsync(Arg.Any<IEnumerable<Guid>>(), Arg.Any<CancellationToken>())
            .Returns(Result.Ok<IReadOnlyList<ResourceDto>>([dto]));

        var store = new ExecutionEntityStore(_repositoryApi, _logger);

        // Act
        await store.PrefetchResourcesAsync([resourceId], CancellationToken.None);

        // Assert - Cached by ResourceId
        var byResource = store.GetProperties("resource", resourceId);
        byResource.Should().NotBeNull();
        byResource!["DisplayName"].Should().Be("Warrior_Armor.duf");
        byResource["RelativePath"].Should().Be("People/Genesis 8 Female/Clothing/Warrior_Armor.duf");
        byResource["BaseName"].Should().Be("Warrior_Armor");
        byResource["FileName"].Should().Be("Warrior_Armor.duf");

        // Assert - Cached by ResourceVersionId
        var byVersion = store.GetProperties("resource", versionId);
        byVersion.Should().NotBeNull();
        byVersion!["ResourceId"].Should().Be(resourceId);

        // Verify RepositoryApi was called once
        await _repositoryApi.Received(1).GetResourcesByIdsAsync(Arg.Any<IEnumerable<Guid>>(), Arg.Any<CancellationToken>());

        // Act 2: Prefetching same ID again shouldn't re-query RepositoryApi
        await store.PrefetchResourcesAsync([resourceId, versionId], CancellationToken.None);
        await _repositoryApi.Received(1).GetResourcesByIdsAsync(Arg.Any<IEnumerable<Guid>>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ResourceStructDefinition_ResolveAsync_ShouldUseCachedResourceWithoutCallingDb()
    {
        // Arrange
        var resourceId = Guid.NewGuid();
        var versionId = Guid.NewGuid();
        var contentId = Guid.NewGuid();

        var dto = new ResourceDto(
            ResourceId: resourceId,
            ResourceVersionId: versionId,
            DisplayName: "Hair.duf",
            Extension: ".duf",
            RelativePath: "People/Hair/LongHair.duf",
            FileHash: "hash_hair",
            ContentId: contentId,
            MetadataJson: "{\"category\": \"Hair\"}"
        );

        _repositoryApi.GetResourcesByIdsAsync(Arg.Any<IEnumerable<Guid>>(), Arg.Any<CancellationToken>())
            .Returns(Result.Ok<IReadOnlyList<ResourceDto>>([dto]));

        var store = new ExecutionEntityStore(_repositoryApi, _logger);
        await store.PrefetchResourcesAsync([versionId], CancellationToken.None);

        var structDef = new ResourceStructDefinition(_repositoryApi, _contentApi, store);

        // Act - Break struct using URN
        var urn = $"urn:resourceversion:{versionId}";
        var fields = await structDef.ResolveAsync(urn, _context);

        // Assert
        fields.Should().NotBeNull();
        fields!["ResourceId"].Should().Be(resourceId);
        fields["DisplayName"].Should().Be("Hair.duf");
        fields["RelativePath"].Should().Be("People/Hair/LongHair.duf");

        // Verify fallback DB method GetResourceLocationAsync was NOT called
        await _repositoryApi.DidNotReceive().GetResourceLocationAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public void SetProperties_ShouldUpdateStoreInPlace()
    {
        // Arrange
        var resourceId = Guid.NewGuid();
        var store = new ExecutionEntityStore(_repositoryApi, _logger);
        var initialProps = new Dictionary<string, object?>
        {
            ["ResourceId"] = resourceId,
            ["Metadata"] = "{\"processed\": false}"
        };

        store.SetProperties("resource", resourceId, initialProps);

        // Act
        var updatedProps = new Dictionary<string, object?>
        {
            ["ResourceId"] = resourceId,
            ["Metadata"] = "{\"processed\": true, \"count\": 42}"
        };
        store.SetProperties("resource", resourceId, updatedProps);

        // Assert
        var result = store.GetProperties("resource", resourceId);
        result.Should().NotBeNull();
        result!["Metadata"].Should().Be("{\"processed\": true, \"count\": 42}");
    }

    [Fact]
    public async Task PrefetchResourcesAsync_ShouldPopulateContentNameAndContentType_WhenContentAssigned()
    {
        // Arrange
        var resourceId = Guid.NewGuid();
        var versionId = Guid.NewGuid();
        var contentId = Guid.NewGuid();

        var dto = new ResourceDto(
            ResourceId: resourceId,
            ResourceVersionId: versionId,
            DisplayName: "eva.duf",
            Extension: ".duf",
            RelativePath: "Eva/eva.duf",
            FileHash: "hash123",
            ContentId: contentId,
            MetadataJson: "{}"
        );

        _repositoryApi.GetResourcesByIdsAsync(Arg.Any<IEnumerable<Guid>>(), Arg.Any<CancellationToken>())
            .Returns(Result.Ok<IReadOnlyList<ResourceDto>>([dto]));

        var contentSummary = new ContentSummaryDto(contentId, "Eva", Guid.NewGuid(), "Characters", null, null);
        _contentApi.GetContentsByIdsAsync(Arg.Any<IEnumerable<Guid>>(), Arg.Any<CancellationToken>())
            .Returns(Result.Ok<IReadOnlyDictionary<Guid, ContentSummaryDto>>(new Dictionary<Guid, ContentSummaryDto>
            {
                [contentId] = contentSummary
            }));

        var store = new ExecutionEntityStore(_repositoryApi, _logger, _contentApi);

        // Act
        await store.PrefetchResourcesAsync([resourceId], CancellationToken.None);

        // Assert
        var byResource = store.GetProperties("resource", resourceId);
        byResource.Should().NotBeNull();
        byResource!["ContentId"].Should().Be(contentId.ToString());
        byResource["ContentName"].Should().Be("Eva");
        byResource["ContentType"].Should().Be("Characters");

        var structDef = new ResourceStructDefinition(_repositoryApi, _contentApi, store);
        var resolved = await structDef.ResolveAsync($"urn:resource:{resourceId}", _context);
        resolved["ContentName"].Should().Be("Eva");
        resolved["ContentType"].Should().Be("Characters");
    }
}
