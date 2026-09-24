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
    private readonly ToolExecutionContext _context = new(Guid.NewGuid(), Guid.NewGuid(), Guid.Empty, CancellationToken.None);

    [Fact]
    public async Task ExecuteAsync_BatchMode_ShouldUpdateAllEntriesInMetadataMap()
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
    public async Task ExecuteAsync_SingleMode_ShouldUpdateSingleResource()
    {
        var id = Guid.NewGuid();

        _workspaceApi.GetResourceLocationAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>())
            .Returns(Result.Fail<ResourceLocationInfoDto>("Not found, use direct"));

        _workspaceApi.UpdateMetadataAsync(Arg.Any<Guid>(), Arg.Any<JsonDocument>(), Arg.Any<CancellationToken>())
            .Returns(Result.Ok());

        var tool = new UpdateResourceMetadataTool(_workspaceApi);
        var inputs = new Dictionary<string, object>
        {
            ["Target"] = $"urn:resource:{id}",
            ["Metadata"] = """{"slot_count": 5}"""
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        result["Success"].Should().Be(true);
        result["UpdatedCount"].Should().Be(1);
        EntityRefHelper.ExtractRefId(result["ResourceVersionId"]).Should().Be(id);

        await _workspaceApi.Received(1).UpdateMetadataAsync(Arg.Is<Guid>(g => g == id), Arg.Any<JsonDocument>(), Arg.Any<CancellationToken>());
    }
}
