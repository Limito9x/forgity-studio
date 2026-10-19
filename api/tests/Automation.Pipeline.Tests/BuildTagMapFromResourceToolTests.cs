using System.Text.Json;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Tools;
using Automation.Pipeline.Tools.Tags;
using Automation.Repository.Contracts;
using Automation.Repository.Contracts.Dtos;
using Automation.Tag.Contracts.Dtos;
using FluentAssertions;
using FluentResults;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace Automation.Pipeline.Tests;

public class BuildTagMapFromResourceToolTests
{
    private readonly IRepositoryApi _repositoryApi = Substitute.For<IRepositoryApi>();
    private readonly ToolExecutionContext _context = new(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

    [Fact]
    public async Task ExecuteAsync_BatchFirst_WithRepositoryAndRelativePaths_ShouldKeyByRelativePathAndCleanTags()
    {
        // Arrange
        var repoId = Guid.NewGuid();
        var resourceId = Guid.NewGuid();
        var versionId = Guid.NewGuid();
        var relPath = "Characters/Eva/Eva.fbx";

        _repositoryApi.ResolveResourceVersionIdsByPathsAsync(repoId, Arg.Any<IEnumerable<string>>(), Arg.Any<CancellationToken>())
            .Returns(Result.Ok(new Dictionary<string, Guid> { [relPath] = versionId }));

        var tagLink = new TagLinkDetailDto(
            TagLinkId: Guid.NewGuid(),
            TagId: Guid.NewGuid(),
            TagPath: "Materials.Eyelash.Textures.Eyelash_Normal",
            TagName: "Eyelash_Normal",
            TagColor: null,
            TagDescription: null,
            TargetSubPath: null,
            MetadataJson: null
        );

        var batchItem = new ResourceBatchItemDto(
            ResourceId: resourceId,
            ResourceVersionId: versionId,
            Name: "Eva",
            RelativePath: @"Characters\Eva\Eva.fbx", // Windows backslash to test POSIX normalization
            FullLocalPath: @"D:\Repo\Characters\Eva\Eva.fbx",
            Metadata: JsonDocument.Parse("""{"objects": {"Eva": {"slots": [{"textures": ["textures/Genesis9_Eyelashes01_NM.jpg"]}]}}}"""),
            ResourceTags: [],
            TagMap: new Dictionary<string, IReadOnlyList<TagLinkDetailDto>>
            {
                ["objects.Eva.slots[0].textures[0]"] = [tagLink]
            }
        );

        _repositoryApi.GetBatchResourceDetailsAsync(Arg.Any<IEnumerable<Guid>>(), Arg.Any<CancellationToken>())
            .Returns(Result.Ok(new Dictionary<Guid, ResourceBatchItemDto> { [versionId] = batchItem }));

        var tool = new BuildTagMapFromResourceTool(_repositoryApi, NullLogger<BuildTagMapFromResourceTool>.Instance);

        var inputs = new Dictionary<string, object>
        {
            ["Repository"] = repoId,
            ["RelativePaths"] = new[] { relPath }
        };

        // Act
        var result = await tool.ExecuteAsync(inputs, _context);

        // Assert
        result.Should().ContainKey("ObjectsMap");
        var objectsMap = result["ObjectsMap"] as Dictionary<string, object?>;
        objectsMap.Should().NotBeNull();

        // 1. Key MUST be normalized POSIX relative path
        objectsMap!.Should().ContainKey("Characters/Eva/Eva.fbx");
        objectsMap.Should().NotContainKey("Eva"); // Old assetName key should no longer be primary dictionary key

        var assetData = objectsMap["Characters/Eva/Eva.fbx"] as Dictionary<string, object?>;
        assetData.Should().NotBeNull();
        assetData!["relative_path"].Should().Be("Characters/Eva/Eva.fbx");
        assetData["asset_name"].Should().Be("Eva");

        // 2. TagMap leaf values
        var tagMap = assetData["tag_map"] as Dictionary<string, object?>;
        tagMap.Should().NotBeNull();
        tagMap!["Eyelash_Normal"].Should().Be("textures/Genesis9_Eyelashes01_NM.jpg");

        // 3. PathMap tags should NOT contain database GUID 'id'
        var pathMap = assetData["path_map"] as Dictionary<string, object?>;
        pathMap.Should().NotBeNull();
        pathMap.Should().ContainKey("objects.Eva.slots[0].textures[0]");

        var slotEntry = pathMap!["objects.Eva.slots[0].textures[0]"] as Dictionary<string, object?>;
        slotEntry.Should().NotBeNull();
        slotEntry!["value"].Should().Be("textures/Genesis9_Eyelashes01_NM.jpg");

        var tagsList = slotEntry["tags"] as List<Dictionary<string, object?>>;
        tagsList.Should().NotBeNull();
        tagsList!.Should().HaveCount(1);
        tagsList[0].Should().ContainKey("name").WhoseValue.Should().Be("Eyelash_Normal");
        tagsList[0].Should().ContainKey("path").WhoseValue.Should().Be("Materials.Eyelash.Textures.Eyelash_Normal");
        tagsList[0].Should().NotContainKey("id"); // Useless database GUID must be completely stripped!
    }

    [Fact]
    public async Task ExecuteAsync_BackwardCompatibility_WithTargetResourceGuids_ShouldSucceed()
    {
        // Arrange
        var resourceId = Guid.NewGuid();
        var versionId = Guid.NewGuid();

        var batchItem = new ResourceBatchItemDto(
            ResourceId: resourceId,
            ResourceVersionId: versionId,
            Name: "Sword",
            RelativePath: "Props/Weapons/Sword.fbx",
            FullLocalPath: "D:/Repo/Props/Weapons/Sword.fbx",
            Metadata: null,
            ResourceTags: [],
            TagMap: []
        );

        _repositoryApi.GetBatchResourceDetailsAsync(Arg.Any<IEnumerable<Guid>>(), Arg.Any<CancellationToken>())
            .Returns(Result.Ok(new Dictionary<Guid, ResourceBatchItemDto> { [resourceId] = batchItem }));

        var tool = new BuildTagMapFromResourceTool(_repositoryApi, NullLogger<BuildTagMapFromResourceTool>.Instance);

        var inputs = new Dictionary<string, object>
        {
            ["Target"] = new[] { resourceId }
        };

        // Act
        var result = await tool.ExecuteAsync(inputs, _context);

        // Assert
        var objectsMap = result["ObjectsMap"] as Dictionary<string, object?>;
        objectsMap.Should().NotBeNull();
        objectsMap!.Should().ContainKey("Props/Weapons/Sword.fbx");
    }

    [Fact]
    public async Task ExecuteAsync_EmptyInputs_ShouldThrowArgumentException()
    {
        // Arrange
        var tool = new BuildTagMapFromResourceTool(_repositoryApi, NullLogger<BuildTagMapFromResourceTool>.Instance);
        var inputs = new Dictionary<string, object>();

        // Act & Assert
        await Assert.ThrowsAsync<ArgumentException>(() => tool.ExecuteAsync(inputs, _context));
    }
}
