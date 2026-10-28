using System.Text.Json;
using Automation.Content.Contracts;
using Automation.DynamicForms.Contracts;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Contracts.Tools;
using Automation.Pipeline.Contracts.Tools.Content;
using Automation.Pipeline.Domain.Enums;
using FluentAssertions;
using FluentResults;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace Automation.Pipeline.Tests;

public class LookupContentMapToolTests
{
    private readonly IContentApi _contentApi = Substitute.For<IContentApi>();
    private readonly ISchemaApi _schemaApi = Substitute.For<ISchemaApi>();

    [Fact]
    public void ResolvePins_WhenModeIsByEntityRef_ShouldReturnContentItemsPin()
    {
        var tool = new LookupContentMapTool(_contentApi, _schemaApi, null!, NullLogger<LookupContentMapTool>.Instance);
        var config = new Dictionary<string, object?> { ["Mode"] = "ByEntityRef" };

        var (inputs, _) = tool.ResolvePins(config);

        inputs.Should().HaveCount(2);
        inputs.Select(p => p.Id).Should().BeEquivalentTo(["ContentType", "ContentItems"]);

        var contentItemsPin = inputs.First(p => p.Id == "ContentItems");
        contentItemsPin.PrimitiveType.Should().Be(PinPrimitiveType.EntityRef);
        contentItemsPin.StructType.Should().Be(WellKnownStructTypes.ContentItem);
        contentItemsPin.Cardinality.Should().Be(PinCardinality.Array);
        contentItemsPin.IsRequired.Should().BeTrue();
    }

    [Fact]
    public void ResolvePins_WhenModeIsByKey_ShouldReturnKeysPin()
    {
        var tool = new LookupContentMapTool(_contentApi, _schemaApi, null!, NullLogger<LookupContentMapTool>.Instance);
        var config = new Dictionary<string, object?> { ["Mode"] = "ByKey" };

        var (inputs, _) = tool.ResolvePins(config);

        inputs.Should().HaveCount(2);
        inputs.Select(p => p.Id).Should().BeEquivalentTo(["ContentType", "Keys"]);

        var keysPin = inputs.First(p => p.Id == "Keys");
        keysPin.PrimitiveType.Should().Be(PinPrimitiveType.String);
        keysPin.Cardinality.Should().Be(PinCardinality.Array);
    }

    [Fact]
    public async Task ExecuteAsync_ByKeyMode_ShouldMatchKeysAndReturnContentMap()
    {
        var tool = new LookupContentMapTool(_contentApi, _schemaApi, null!, NullLogger<LookupContentMapTool>.Instance);
        var projectId = Guid.NewGuid();
        var item1Id = Guid.NewGuid();
        var item2Id = Guid.NewGuid();
        var context = new ToolExecutionContext(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None, ProjectId: projectId);

        var contentItems = new Dictionary<Guid, ContentSummaryDto>
        {
            [item1Id] = new(item1Id, "Skin", Guid.NewGuid(), "Material", null, null),
            [item2Id] = new(item2Id, "Eye", Guid.NewGuid(), "Material", null, null)
        };

        _contentApi.GetContentsByProjectIdAsync(projectId, Arg.Any<CancellationToken>())
            .Returns(Result.Ok<IReadOnlyDictionary<Guid, ContentSummaryDto>>(contentItems));

        _schemaApi.GetMultipleDataAsync(Arg.Any<IEnumerable<string>>(), "ContentItem", Arg.Any<CancellationToken>())
            .Returns(Result.Ok<IEnumerable<SchemaDataDto>>([]));

        var inputs = new Dictionary<string, object>
        {
            ["ContentType"] = "Material",
            ["Keys"] = new[] { "Skin" }
        };

        var result = await tool.ExecuteAsync(inputs, context);

        result.Should().ContainKey("ContentMap");
        var contentMap = result["ContentMap"] as Dictionary<string, object>;
        contentMap.Should().NotBeNull();
        contentMap.Should().ContainKey("Skin");

        var contentIds = result["ContentIds"] as List<Guid>;
        contentIds.Should().NotBeNull();
        contentIds.Should().ContainSingle().Which.Should().Be(item1Id);
    }

    [Fact]
    public async Task ExecuteAsync_ByEntityRefMode_ShouldLookupDirectItemsAndReturnContentMap()
    {
        var tool = new LookupContentMapTool(_contentApi, _schemaApi, null!, NullLogger<LookupContentMapTool>.Instance);
        var projectId = Guid.NewGuid();
        var item1Id = Guid.NewGuid();
        var item2Id = Guid.NewGuid();
        var context = new ToolExecutionContext(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None, ProjectId: projectId);

        var contentItems = new Dictionary<Guid, ContentSummaryDto>
        {
            [item1Id] = new(item1Id, "Eva", Guid.NewGuid(), "Character", null, null),
            [item2Id] = new(item2Id, "Sam", Guid.NewGuid(), "Character", null, null)
        };

        _contentApi.GetContentsByProjectIdAsync(projectId, Arg.Any<CancellationToken>())
            .Returns(Result.Ok<IReadOnlyDictionary<Guid, ContentSummaryDto>>(contentItems));

        _schemaApi.GetMultipleDataAsync(Arg.Any<IEnumerable<string>>(), "ContentItem", Arg.Any<CancellationToken>())
            .Returns(Result.Ok<IEnumerable<SchemaDataDto>>([]));

        var inputs = new Dictionary<string, object>
        {
            ["ContentItems"] = new[] { item1Id.ToString() }
        };

        var result = await tool.ExecuteAsync(inputs, context);

        result.Should().ContainKey("ContentMap");
        var contentMap = result["ContentMap"] as Dictionary<string, object>;
        contentMap.Should().NotBeNull();
        contentMap.Should().ContainKey("Eva");
        contentMap.Should().NotContainKey("Sam");

        var contentIds = result["ContentIds"] as List<Guid>;
        contentIds.Should().NotBeNull();
        contentIds.Should().ContainSingle().Which.Should().Be(item1Id);
    }
}
