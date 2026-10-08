using System.Text.Json;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Tools;
using Automation.Pipeline.Tools.Workspaces;
using Automation.Repository.Contracts;
using FluentAssertions;
using FluentResults;
using NSubstitute;
using Xunit;

namespace Automation.Pipeline.Tests;

public class UpdateResourceMetadataToolTests
{
    private readonly IRepositoryApi _workspaceApi = Substitute.For<IRepositoryApi>();
    private readonly ToolExecutionContext _context = new(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

    [Fact]
    public async Task ExecuteAsync_BatchMode_WithGuids_ShouldUpdateAllEntries()
    {
        var id1 = Guid.NewGuid();
        var id2 = Guid.NewGuid();

        _workspaceApi.GetResourceLocationAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>())
            .Returns(Result.Fail<ResourceLocationInfoDto>("Not found, use direct"));

        _workspaceApi.UpdateMetadataAsync(Arg.Any<Guid>(), Arg.Any<JsonDocument>(), Arg.Any<CancellationToken>())
            .Returns(Result.Ok());

        var tool = new UpdateResourceMetadataTool(_workspaceApi);
        var inputs = new Dictionary<string, object>
        {
            ["MetadataMap"] = new Dictionary<string, object?>
            {
                [$"urn:resource:{id1}"] = new { slot_count = 1 },
                [$"urn:resource:{id2}"] = """{"slot_count": 2}"""
            }
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        result["Success"].Should().Be(true);
        result["UpdatedCount"].Should().Be(2);

        await _workspaceApi.Received(2).UpdateMetadataAsync(Arg.Any<Guid>(), Arg.Any<JsonDocument>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ExecuteAsync_BatchMode_WithFilePaths_ShouldResolveAndBatchUpdate()
    {
        var repoId = Guid.NewGuid();
        var versionId1 = Guid.NewGuid();
        var versionId2 = Guid.NewGuid();

        var pathMap = new Dictionary<string, Guid>
        {
            ["Characters/Hero.duf"] = versionId1,
            ["Props/Sword.duf"] = versionId2
        };

        _workspaceApi.ResolveResourceVersionIdsByPathsAsync(repoId, Arg.Any<IEnumerable<string>>(), Arg.Any<CancellationToken>())
            .Returns(Result.Ok(pathMap));

        _workspaceApi.GetResourceLocationAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>())
            .Returns(Result.Fail<ResourceLocationInfoDto>("Use version id directly"));

        _workspaceApi.UpdateMetadataAsync(Arg.Any<Guid>(), Arg.Any<JsonDocument>(), Arg.Any<CancellationToken>())
            .Returns(Result.Ok());

        var tool = new UpdateResourceMetadataTool(_workspaceApi);
        var inputs = new Dictionary<string, object>
        {
            ["Repository"] = $"repository:{repoId}",
            ["MetadataMap"] = new Dictionary<string, object?>
            {
                ["Characters/Hero.duf"] = new { character = "Hero" },
                ["Props/Sword.duf"] = """{"type": "Weapon"}"""
            }
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        result["Success"].Should().Be(true);
        result["UpdatedCount"].Should().Be(2);

        await _workspaceApi.Received(1).UpdateMetadataAsync(Arg.Is<Guid>(g => g == versionId1), Arg.Any<JsonDocument>(), Arg.Any<CancellationToken>());
        await _workspaceApi.Received(1).UpdateMetadataAsync(Arg.Is<Guid>(g => g == versionId2), Arg.Any<JsonDocument>(), Arg.Any<CancellationToken>());
    }
}
