using Automation.Content.Contracts;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Contracts.Tools;
using Automation.Pipeline.Contracts.Tools.Workspaces;
using Automation.Pipeline.Domain.Enums;
using Automation.Repository.Contracts;
using FluentAssertions;
using FluentResults;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace Automation.Pipeline.Tests;

public class AssignResourcesToContentToolTests
{
    private readonly IRepositoryApi _workspaceApi = Substitute.For<IRepositoryApi>();
    private readonly IContentApi _contentApi = Substitute.For<IContentApi>();
    private readonly ToolExecutionContext _context = new(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

    [Fact]
    public void ResolvePins_WhenModeIsByEntityRef_ShouldReturnContentItemAndResourcesPins()
    {
        var tool = new AssignResourcesToContentTool(_workspaceApi, _contentApi, NullLogger<AssignResourcesToContentTool>.Instance);
        var config = new Dictionary<string, object?> { ["Mode"] = "ByEntityRef" };

        var (inputs, _) = tool.ResolvePins(config);

        inputs.Should().HaveCount(2);
        inputs.Select(p => p.Id).Should().BeEquivalentTo(["ContentItem", "Resources"]);

        var contentItemPin = inputs.First(p => p.Id == "ContentItem");
        contentItemPin.PrimitiveType.Should().Be(PinPrimitiveType.EntityRef);
        contentItemPin.StructType.Should().Be(WellKnownStructTypes.ContentItem);
        contentItemPin.IsRequired.Should().BeTrue();
    }

    [Fact]
    public void ResolvePins_WhenModeIsByName_ShouldReturnContentTypeAndNamePins()
    {
        var tool = new AssignResourcesToContentTool(_workspaceApi, _contentApi, NullLogger<AssignResourcesToContentTool>.Instance);
        var config = new Dictionary<string, object?> { ["Mode"] = "ByName" };

        var (inputs, _) = tool.ResolvePins(config);

        inputs.Should().HaveCount(4);
        inputs.Select(p => p.Id).Should().BeEquivalentTo(["ContentType", "ContentName", "CreateIfNotExists", "Resources"]);

        var contentTypePin = inputs.First(p => p.Id == "ContentType");
        contentTypePin.PrimitiveType.Should().Be(PinPrimitiveType.String);
        contentTypePin.IsRequired.Should().BeTrue();

        var contentNamePin = inputs.First(p => p.Id == "ContentName");
        contentNamePin.PrimitiveType.Should().Be(PinPrimitiveType.String);
        contentNamePin.IsRequired.Should().BeTrue();
    }

    [Fact]
    public async Task ExecuteAsync_ByEntityRefMode_ShouldDirectlyAssignToContentItem()
    {
        var tool = new AssignResourcesToContentTool(_workspaceApi, _contentApi, NullLogger<AssignResourcesToContentTool>.Instance);
        var contentId = Guid.NewGuid();
        var resId1 = Guid.NewGuid();
        var resId2 = Guid.NewGuid();

        _contentApi.GetContentByIdAsync(contentId, Arg.Any<CancellationToken>())
            .Returns(Result.Ok(new ContentSummaryDto(
                contentId,
                "Eva",
                Guid.NewGuid(),
                "Character",
                null,
                null
            )));

        _workspaceApi.AssignResourceToContentAsync(contentId, Arg.Any<List<Guid>>(), Arg.Any<CancellationToken>())
            .Returns(Result.Ok());

        var inputs = new Dictionary<string, object>
        {
            ["ContentItem"] = contentId.ToString(),
            ["Resources"] = new[] { resId1.ToString(), resId2.ToString() }
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        result["Success"].Should().Be(true);
        result["ContentName"].Should().Be("Eva");
        result["ContentType"].Should().Be("Character");
        result["AssignedCount"].Should().Be(2);
    }

    [Fact]
    public async Task ExecuteAsync_ByNameMode_ShouldGetOrCreateContentItemAndAssign()
    {
        var tool = new AssignResourcesToContentTool(_workspaceApi, _contentApi, NullLogger<AssignResourcesToContentTool>.Instance);
        var projectId = Guid.NewGuid();
        var contentId = Guid.NewGuid();
        var resId = Guid.NewGuid();
        var context = new ToolExecutionContext(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None, ProjectId: projectId);

        _contentApi.GetOrCreateContentItemAsync(projectId, "Clothing", "WarriorArmor", true, Arg.Any<CancellationToken>())
            .Returns(Result.Ok(new ContentSummaryDto(contentId, "WarriorArmor", Guid.NewGuid(), "Clothing", null, null)));

        _workspaceApi.AssignResourceToContentAsync(contentId, Arg.Any<List<Guid>>(), Arg.Any<CancellationToken>())
            .Returns(Result.Ok());

        var inputs = new Dictionary<string, object>
        {
            ["ContentType"] = "Clothing",
            ["ContentName"] = "WarriorArmor",
            ["CreateIfNotExists"] = true,
            ["Resources"] = new[] { resId.ToString() }
        };

        var result = await tool.ExecuteAsync(inputs, context);

        result["Success"].Should().Be(true);
        result["ContentId"].Should().Be(contentId.ToString());
        result["ContentName"].Should().Be("WarriorArmor");
        result["ContentType"].Should().Be("Clothing");
        result["AssignedCount"].Should().Be(1);
    }
}
