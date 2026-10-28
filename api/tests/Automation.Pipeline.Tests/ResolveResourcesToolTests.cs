using System.Text.Json;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Contracts.Tools;
using Automation.Pipeline.Contracts.Tools.Workspaces;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Runtime.State.EntityStore;
using Automation.Repository.Contracts;
using Automation.Repository.Contracts.Dtos;
using FluentAssertions;
using FluentResults;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace Automation.Pipeline.Tests;

public class ResolveResourcesToolTests
{
    private readonly IRepositoryApi _repositoryApi = Substitute.For<IRepositoryApi>();
    private readonly ILogger<ExecutionEntityStore> _storeLogger = Substitute.For<ILogger<ExecutionEntityStore>>();
    private readonly ILogger<ResolveResourcesTool> _toolLogger = Substitute.For<ILogger<ResolveResourcesTool>>();
    private readonly ToolExecutionContext _context = new(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

    [Fact]
    public async Task ExecuteAsync_ShouldResolveFullPaths_WhenAlreadyInCacheWithFullPath()
    {
        // Arrange
        var resourceId = Guid.NewGuid();
        var store = new ExecutionEntityStore(_repositoryApi, _storeLogger);
        store.SetProperties(WellKnownStructTypes.Resource, resourceId, new Dictionary<string, object?>
        {
            ["ResourceId"] = resourceId,
            ["RelativePath"] = "Characters/Eva/Eva.fbx",
            ["FullPath"] = "D:/Projects/Repo/Characters/Eva/Eva.fbx"
        });

        var tool = new ResolveResourcesTool(store, _repositoryApi, _toolLogger);
        var inputs = new Dictionary<string, object>
        {
            ["Resources"] = new[] { resourceId.ToString() }
        };

        // Act
        var result = await tool.ExecuteAsync(inputs, _context);

        // Assert
        result.Should().ContainKey("FullPaths");
        var fullPaths = result["FullPaths"] as string[];
        fullPaths.Should().NotBeNull();
        fullPaths.Should().ContainSingle().Which.Should().Be("D:/Projects/Repo/Characters/Eva/Eva.fbx");
        result["Count"].Should().Be(1);
    }

    [Fact]
    public async Task ExecuteAsync_ShouldCombineRootPath_WhenWorkstationProvided()
    {
        // Arrange
        var wsId = Guid.NewGuid();
        var resourceId = Guid.NewGuid();
        var store = new ExecutionEntityStore(_repositoryApi, _storeLogger);

        _repositoryApi.GetWorkstationByIdAsync(wsId, Arg.Any<CancellationToken>())
            .Returns(Result.Ok(new WorkstationDto(wsId, Guid.NewGuid(), "Repo", Guid.NewGuid(), "Runner", "D:/Mount/Workspace", true)));

        store.SetProperties(WellKnownStructTypes.Resource, resourceId, new Dictionary<string, object?>
        {
            ["ResourceId"] = resourceId,
            ["RelativePath"] = "Characters/Eva/Eva.fbx"
        });

        var tool = new ResolveResourcesTool(store, _repositoryApi, _toolLogger);
        var inputs = new Dictionary<string, object>
        {
            ["Resources"] = new[] { resourceId.ToString() },
            ["Workstation"] = wsId.ToString()
        };

        // Act
        var result = await tool.ExecuteAsync(inputs, _context);

        // Assert
        var fullPaths = result["FullPaths"] as string[];
        fullPaths.Should().NotBeNull();
        fullPaths.Should().ContainSingle().Which.Should().Be("D:/Mount/Workspace/Characters/Eva/Eva.fbx");
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
            DisplayName: "model.fbx",
            Extension: ".fbx",
            RelativePath: "Scenes/Test/uncached_model.fbx",
            FileHash: "hash123",
            ContentId: null,
            MetadataJson: "{}",
            RepositoryId: Guid.NewGuid(),
            FullLocalPath: "D:/Mount/Scenes/Test/uncached_model.fbx",
            MountPath: "D:/Mount",
            RunnerId: Guid.NewGuid()
        );

        _repositoryApi.GetResourcesByIdsAsync(Arg.Any<IEnumerable<Guid>>(), Arg.Any<CancellationToken>())
            .Returns(Result.Ok<IReadOnlyList<ResourceDto>>([dto]));

        var store = new ExecutionEntityStore(_repositoryApi, _storeLogger);
        var tool = new ResolveResourcesTool(store, _repositoryApi, _toolLogger);

        var inputs = new Dictionary<string, object>
        {
            ["Resources"] = new[] { resourceId.ToString() }
        };

        // Act
        var result = await tool.ExecuteAsync(inputs, _context);

        // Assert
        var fullPaths = result["FullPaths"] as string[];
        fullPaths.Should().NotBeNull();
        fullPaths.Should().ContainSingle().Which.Should().Be("D:/Mount/Scenes/Test/uncached_model.fbx");
    }

    [Fact]
    public async Task ExecuteAsync_ShouldProduce_MetadataMap_KeyedByFullPathOnly()
    {
        // Arrange
        var resourceId = Guid.NewGuid();
        var store = new ExecutionEntityStore(_repositoryApi, _storeLogger);
        var fullPath = "D:/Mount/Characters/Sam/Sam.fbx";
        store.SetProperties(WellKnownStructTypes.Resource, resourceId, new Dictionary<string, object?>
        {
            ["ResourceId"] = resourceId,
            ["RelativePath"] = "Characters/Sam/Sam.fbx",
            ["FullPath"] = fullPath,
            ["BaseName"] = "Sam",
            ["Metadata"] = "{\"slot_count\": 8, \"slots\": [{\"name\": \"Undies_Heart-1\"}]}"
        });

        var tool = new ResolveResourcesTool(store, _repositoryApi, _toolLogger);
        var inputs = new Dictionary<string, object>
        {
            ["Resources"] = new[] { resourceId.ToString() }
        };

        // Act
        var result = await tool.ExecuteAsync(inputs, _context);

        // Assert
        result.Should().ContainKey("MetadataMap");
        var metaMap = result["MetadataMap"] as Dictionary<string, object>;
        metaMap.Should().NotBeNull();
        metaMap.Should().ContainKey(fullPath);
        metaMap.Should().NotContainKey("Characters/Sam/Sam.fbx"); // Key là FullPath duy nhất, không dùng relative path

        var samEntry = metaMap![fullPath] as Dictionary<string, object?>;
        samEntry.Should().NotBeNull();
        samEntry!["asset_name"].Should().Be("Sam");
        samEntry["full_path"].Should().Be(fullPath);
        samEntry.Should().ContainKey("slots");
        samEntry["slot_count"]!.ToString().Should().Be("8");
    }
}
