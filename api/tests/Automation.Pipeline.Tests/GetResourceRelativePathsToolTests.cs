using System.Text.Json;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.EntityStore;
using Automation.Pipeline.Tools;
using Automation.Pipeline.Tools.Workspaces;
using Automation.Repository.Contracts;
using FluentAssertions;
using FluentResults;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace Automation.Pipeline.Tests;

public class GetResourceRelativePathsToolTests
{
    private readonly IRepositoryApi _repositoryApi = Substitute.For<IRepositoryApi>();
    private readonly ILogger<ExecutionEntityStore> _storeLogger = Substitute.For<ILogger<ExecutionEntityStore>>();
    private readonly ILogger<GetResourceRelativePathsTool> _toolLogger = Substitute.For<ILogger<GetResourceRelativePathsTool>>();
    private readonly ToolExecutionContext _context = new(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

    [Fact]
    public async Task ExecuteAsync_ShouldResolvePaths_WhenAlreadyInCache()
    {
        // Arrange
        var resourceId = Guid.NewGuid();
        var store = new ExecutionEntityStore(_repositoryApi, _storeLogger);
        store.SetProperties("resource", resourceId, new Dictionary<string, object?>
        {
            ["ResourceId"] = resourceId,
            ["RelativePath"] = "Scenes/Test/model.duf"
        });

        var tool = new GetResourceRelativePathsTool(store, _toolLogger);
        var inputs = new Dictionary<string, object>
        {
            ["Resources"] = new[] { resourceId.ToString() }
        };

        // Act
        var result = await tool.ExecuteAsync(inputs, _context);

        // Assert
        result.Should().ContainKey("RelativePaths");
        var paths = result["RelativePaths"] as string[];
        paths.Should().NotBeNull();
        paths.Should().ContainSingle().Which.Should().Be("Scenes/Test/model.duf");
        result["Count"].Should().Be(1);
    }

    [Fact]
    public async Task ExecuteAsync_ShouldSelfHeal_ByFetchingFromDatabase_WhenNotInCache()
    {
        // Arrange
        var resourceId = Guid.NewGuid();
        var versionId = Guid.NewGuid();
        var dto = new ResourceDto(
            ResourceId: resourceId,
            ResourceVersionId: versionId,
            DisplayName: "model.duf",
            Extension: ".duf",
            RelativePath: "Scenes/Test/uncached_model.duf",
            FileHash: "hash123",
            ContentId: null,
            MetadataJson: "{}"
        );

        _repositoryApi.GetResourcesByIdsAsync(Arg.Any<IEnumerable<Guid>>(), Arg.Any<CancellationToken>())
            .Returns(Result.Ok<IReadOnlyList<ResourceDto>>([dto]));

        var store = new ExecutionEntityStore(_repositoryApi, _storeLogger);
        var tool = new GetResourceRelativePathsTool(store, _toolLogger);

        var inputs = new Dictionary<string, object>
        {
            ["Resources"] = new[] { resourceId.ToString() }
        };

        // Act
        var result = await tool.ExecuteAsync(inputs, _context);

        // Assert
        var paths = result["RelativePaths"] as string[];
        paths.Should().NotBeNull();
        paths.Should().ContainSingle().Which.Should().Be("Scenes/Test/uncached_model.duf");
    }

    [Fact]
    public async Task ExecuteAsync_ShouldHandle_DirectPathStrings_AndJsonObjects()
    {
        // Arrange
        var store = new ExecutionEntityStore(_repositoryApi, _storeLogger);
        var tool = new GetResourceRelativePathsTool(store, _toolLogger);

        using var jsonDoc = JsonDocument.Parse("[{\"relativePath\": \"Scenes/Prop/sword.duf\"}]");
        var jsonArray = jsonDoc.RootElement.Clone();

        var inputs = new Dictionary<string, object>
        {
            ["Resources"] = new object[]
            {
                "Characters/Genesis8/Female.duf",
                jsonArray
            }
        };

        // Act
        var result = await tool.ExecuteAsync(inputs, _context);

        // Assert
        var paths = result["RelativePaths"] as string[];
        paths.Should().NotBeNull();
        paths.Should().HaveCount(2);
        paths.Should().Contain("Characters/Genesis8/Female.duf");
        paths.Should().Contain("Scenes/Prop/sword.duf");
    }
}
