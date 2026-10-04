using System.Text.Json;
using Automation.Repository.Contracts.Dtos;
using Automation.Repository.Contracts.Extensions;
using Automation.Tag.Contracts.Dtos;
using Xunit;

namespace Automation.Pipeline.Tests;

public class MetadataExtensionsTests
{
    private const string SampleJson = """
    {
        "summary": "Sample summary",
        "objects": [
            {
                "name": "MB Yeimi HD for Genesis 9 Feminine",
                "type": "mesh"
            }
        ]
    }
    """;

    [Fact]
    public void ExtractJsonValue_WhenRootIsJsonObject_ExtractsCorrectly()
    {
        using var doc = JsonDocument.Parse(SampleJson);
        var val = doc.RootElement.ExtractJsonValue("objects[name='MB Yeimi HD for Genesis 9 Feminine'].name");

        Assert.Equal("MB Yeimi HD for Genesis 9 Feminine", val);
    }

    [Fact]
    public void ExtractJsonValue_WhenRootIsDoubleSerializedJsonString_UnwrapsAndExtractsCorrectly()
    {
        // When JSON is double-serialized (stored as a JSON string inside JSONB)
        var doubleSerialized = JsonSerializer.Serialize(SampleJson);
        using var doc = JsonDocument.Parse(doubleSerialized);

        Assert.Equal(JsonValueKind.String, doc.RootElement.ValueKind);

        var val = doc.RootElement.ExtractJsonValue("objects[name='MB Yeimi HD for Genesis 9 Feminine'].name");

        Assert.Equal("MB Yeimi HD for Genesis 9 Feminine", val);
    }

    [Fact]
    public void GetAllValuesByTag_WhenMetadataIsDoubleSerialized_ReturnsCorrectValues()
    {
        var doubleSerialized = JsonSerializer.Serialize(SampleJson);
        using var doc = JsonDocument.Parse(doubleSerialized);

        var tagMap = new Dictionary<string, IReadOnlyList<TagLinkDetailDto>>
        {
            ["objects[name='MB Yeimi HD for Genesis 9 Feminine'].name"] = new List<TagLinkDetailDto>
            {
                new(Guid.NewGuid(), Guid.NewGuid(), "Mesh.Body", "Body", null, null, "objects[name='MB Yeimi HD for Genesis 9 Feminine'].name", null)
            }
        };

        var detail = new ResourceMetadataDetailDto(Guid.NewGuid(), doc, tagMap);

        var valuesByPath = detail.GetAllValuesByTag("Mesh.Body");
        Assert.Single(valuesByPath);
        Assert.Equal("MB Yeimi HD for Genesis 9 Feminine", valuesByPath[0].ToString());

        var valuesByName = detail.GetAllValuesByTag("Body");
        Assert.Single(valuesByName);
        Assert.Equal("MB Yeimi HD for Genesis 9 Feminine", valuesByName[0].ToString());
    }
}
