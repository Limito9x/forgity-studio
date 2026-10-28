using System.Text.Json;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Contracts.StructRegistry.Definitions;
using Automation.Pipeline.Contracts.Tools;
using Automation.Pipeline.Contracts.Tools.Workspaces;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Repository.Contracts;
using FluentAssertions;
using FluentResults;
using Microsoft.Extensions.Logging;
using Automation.Pipeline.Runtime.State.EntityStore;
using NSubstitute;
using Xunit;

namespace Automation.Pipeline.Tests;

public class WorkstationAndResourceFilterToolsTests
{
    private readonly IRepositoryApi _repositoryApi = Substitute.For<IRepositoryApi>();
    private readonly ToolExecutionContext _context = new(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

    [Fact]
    public async Task WorkstationStructDefinition_ShouldDeclareOutputPinsAndResolveCorrectly()
    {
        var workstationId = Guid.NewGuid();
        var repositoryId = Guid.NewGuid();
        var runnerId = Guid.NewGuid();
        var rootPath = "D:/Assets/DazWorkstation";

        var expectedDto = new WorkstationDto(
            workstationId,
            repositoryId,
            "DazAssetsRepo",
            runnerId,
            "LocalRunner",
            rootPath,
            true
        );

        _repositoryApi.GetWorkstationByIdAsync(workstationId, Arg.Any<CancellationToken>())
            .Returns(Result.Ok(expectedDto));

        var structDef = new WorkstationStructDefinition(_repositoryApi);

        // 1. Verify Output Pins
        structDef.StructType.Should().Be(WellKnownStructTypes.Workstation);
        structDef.OutputPins.Should().Contain(p => p.Id == "WorkstationId" && p.PrimitiveType == PinPrimitiveType.EntityRef);
        structDef.OutputPins.Should().Contain(p => p.Id == "RepositoryId" && p.PrimitiveType == PinPrimitiveType.EntityRef);
        structDef.OutputPins.Should().Contain(p => p.Id == "RunnerId" && p.PrimitiveType == PinPrimitiveType.EntityRef);
        structDef.OutputPins.Should().Contain(p => p.Id == "RootPath" && p.PrimitiveType == PinPrimitiveType.String);
        structDef.OutputPins.Should().Contain(p => p.Id == "IsRunnerActive" && p.PrimitiveType == PinPrimitiveType.Boolean);

        // 2. Verify Resolution
        var resolved = await structDef.ResolveAsync(workstationId.ToString(), _context);
        resolved.Should().ContainKey("WorkstationId");
        resolved.Should().ContainKey("RootPath");
        resolved["RootPath"].Should().Be(rootPath);
        resolved["RepositoryName"].Should().Be("DazAssetsRepo");
        resolved["RunnerName"].Should().Be("LocalRunner");
        resolved["IsRunnerActive"].Should().Be(true);
    }

    [Fact]
    public async Task QueryWorkstationResourcesTool_WithWorkstation_ShouldQueryAndReturnArrayAndCount()
    {
        var wsId = Guid.NewGuid();
        var repoId = Guid.NewGuid();
        var runnerId = Guid.NewGuid();
        var resId1 = Guid.NewGuid();
        var resId2 = Guid.NewGuid();

        _repositoryApi.GetWorkstationByIdAsync(wsId, Arg.Any<CancellationToken>())
            .Returns(Result.Ok(new WorkstationDto(wsId, repoId, "Repo", runnerId, "Runner", "D:/Mount", true)));

        var queriedList = new List<ResourceDto>
        {
            new(resId1, Guid.NewGuid(), "hero.duf", ".duf", "Characters/hero.duf", "hash1", null, null, repoId, "D:/Mount/Characters/hero.duf", "D:/Mount", runnerId),
            new(resId2, Guid.NewGuid(), "sidekick.duf", ".duf", "Characters/sidekick.duf", "hash2", null, null, repoId, "D:/Mount/Characters/sidekick.duf", "D:/Mount", runnerId)
        };

        _repositoryApi.QueryResourcesAsync(Arg.Any<ResourceQueryFilter>(), Arg.Any<CancellationToken>())
            .Returns(Result.Ok<IReadOnlyList<ResourceDto>>(queriedList));

        var tool = new QueryWorkstationResourcesTool(_repositoryApi);
        var inputs = new Dictionary<string, object>
        {
            ["Workstation"] = wsId.ToString(),
            ["Extension"] = ".duf",
            ["Keyword"] = "hero"
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        result["Count"].Should().Be(2);
        var allResources = result["Resources"] as System.Collections.IList;
        allResources.Should().NotBeNull();
        allResources!.Count.Should().Be(2);
    }

    [Fact]
    public async Task FilterResourcesTool_InMemory_ShouldFilterByExtensionAndKeyword()
    {
        var store = new ExecutionEntityStore(_repositoryApi, Substitute.For<ILogger<ExecutionEntityStore>>());
        var res1 = Guid.NewGuid();
        var res2 = Guid.NewGuid();
        var res3 = Guid.NewGuid();

        store.SetProperties(WellKnownStructTypes.Resource, res1, new Dictionary<string, object?>
        {
            ["ResourceId"] = res1,
            ["FileName"] = "hero.fbx",
            ["Extension"] = ".fbx",
            ["RelativePath"] = "Characters/hero.fbx"
        });

        store.SetProperties(WellKnownStructTypes.Resource, res2, new Dictionary<string, object?>
        {
            ["ResourceId"] = res2,
            ["FileName"] = "weapon.fbx",
            ["Extension"] = ".fbx",
            ["RelativePath"] = "Props/weapon.fbx"
        });

        store.SetProperties(WellKnownStructTypes.Resource, res3, new Dictionary<string, object?>
        {
            ["ResourceId"] = res3,
            ["FileName"] = "hero.blend",
            ["Extension"] = ".blend",
            ["RelativePath"] = "Characters/hero.blend"
        });

        var tool = new FilterResourcesTool(store);
        var inputs = new Dictionary<string, object>
        {
            ["Resources"] = new[] { res1.ToString(), res2.ToString(), res3.ToString() },
            ["Extension"] = ".fbx",
            ["Keyword"] = "hero"
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        result["Count"].Should().Be(1);

        var first = result["First"] as string;
        first.Should().Be(res1.ToString());

        var filtered = result["Filtered"] as System.Collections.IList;
        filtered.Should().NotBeNull();
        filtered!.Count.Should().Be(1);
        filtered[0]!.ToString().Should().Be(res1.ToString());
    }

    [Fact]
    public async Task SyncLocalChangeToRepositoryTool_WithWorkstationAndFullPath_ShouldStripRootPath()
    {
        var wsId = Guid.NewGuid();
        var repoId = Guid.NewGuid();
        var runnerId = Guid.NewGuid();
        var rootPath = "D:/Assets/DazWorkstation";

        _repositoryApi.GetWorkstationByIdAsync(wsId, Arg.Any<CancellationToken>())
            .Returns(Result.Ok(new WorkstationDto(wsId, repoId, "Repo", runnerId, "Runner", rootPath, true)));

        List<string>? capturedPaths = null;
        _repositoryApi.SyncLocalChangesAsync(repoId, runnerId, Arg.Do<List<string>>(p => capturedPaths = p), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(Result.Ok(new SyncLocalChangesResultDto(repoId, runnerId, 1, 0, 0, [Guid.NewGuid()], new Dictionary<string, Guid> { ["Exports/character.fbx"] = Guid.NewGuid() })));

        var tool = new SyncLocalChangeToRepositoryTool(_repositoryApi);
        var inputs = new Dictionary<string, object>
        {
            ["Workstation"] = wsId.ToString(),
            // Cắm thẳng FullPath tuyệt đối từ Blender xuất ra
            ["RelativePaths"] = new[] { "D:/Assets/DazWorkstation/Exports/character.fbx" }
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        capturedPaths.Should().NotBeNull();
        capturedPaths!.Should().ContainSingle().Which.Should().Be("Exports/character.fbx");
        result["AddedCount"].Should().Be(1);
    }

    [Fact]
    public async Task UpdateResourceMetadataTool_WithWorkstationAndFullPathKeys_ShouldNormalizeKeyToRelative()
    {
        var wsId = Guid.NewGuid();
        var repoId = Guid.NewGuid();
        var runnerId = Guid.NewGuid();
        var rootPath = "D:/Assets/DazWorkstation";
        var versionId = Guid.NewGuid();

        _repositoryApi.GetWorkstationByIdAsync(wsId, Arg.Any<CancellationToken>())
            .Returns(Result.Ok(new WorkstationDto(wsId, repoId, "Repo", runnerId, "Runner", rootPath, true)));

        IEnumerable<string>? capturedPaths = null;
        _repositoryApi.ResolveResourceVersionIdsByPathsAsync(repoId, Arg.Do<IEnumerable<string>>(p => capturedPaths = p), Arg.Any<CancellationToken>())
            .Returns(Result.Ok(new Dictionary<string, Guid> { ["Exports/character.fbx"] = versionId }));

        _repositoryApi.GetResourceLocationAsync(versionId, Arg.Any<CancellationToken>())
            .Returns(Result.Ok(new ResourceLocationInfoDto(versionId, Guid.NewGuid(), "Exports/character.fbx", "hash", runnerId, rootPath)));

        _repositoryApi.UpdateMetadataAsync(versionId, Arg.Any<JsonDocument>(), Arg.Any<CancellationToken>())
            .Returns(Result.Ok());

        var tool = new UpdateResourceMetadataTool(_repositoryApi);
        var inputs = new Dictionary<string, object>
        {
            ["Workstation"] = wsId.ToString(),
            ["MetadataMap"] = new Dictionary<string, object?>
            {
                // Key là đường dẫn FullPath tuyệt đối
                ["D:/Assets/DazWorkstation/Exports/character.fbx"] = new { triangles = 15000 }
            }
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        capturedPaths.Should().NotBeNull();
        capturedPaths!.Should().Contain("Exports/character.fbx");
        result["Success"].Should().Be(true);
        result["UpdatedCount"].Should().Be(1);
    }

    [Fact]
    public void ResourceStructDefinition_OutputPins_ShouldNotContainResourceVersionId()
    {
        // BL-016: Loại bỏ pin nội bộ ResourceVersionId khỏi OutputPins
        var mockContentApi = Substitute.For<Automation.Content.Contracts.IContentApi>();
        var structDef = new Automation.Pipeline.Contracts.StructRegistry.Definitions.ResourceStructDefinition(
            _repositoryApi,
            mockContentApi
        );

        structDef.OutputPins.Should().NotContain(p => p.Id == "ResourceVersionId");
        structDef.OutputPins.Should().Contain(p => p.Id == "ResourceId");
        structDef.OutputPins.Should().Contain(p => p.Id == "FileName");
        structDef.OutputPins.Should().Contain(p => p.Id == "FullPath");
        structDef.OutputPins.Should().Contain(p => p.Id == "RelativePath");
    }

    [Fact]
    public void SyncLocalChangeToRepositoryTool_Inputs_ShouldOnlyContainWorkstationAndPaths()
    {
        // BL-017: Tinh gọn chân pin theo triết lý Workstation-First
        var tool = new SyncLocalChangeToRepositoryTool(_repositoryApi);

        tool.Inputs.Should().HaveCount(2);
        tool.Inputs.Select(p => p.Id).Should().BeEquivalentTo(["Workstation", "RelativePaths"]);
        tool.Inputs.First(p => p.Id == "Workstation").IsRequired.Should().BeTrue();
        tool.Inputs.First(p => p.Id == "RelativePaths").IsRequired.Should().BeTrue();
    }
}

