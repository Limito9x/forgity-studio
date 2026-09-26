using System.Text.Json;
using Automation.Repository.Contracts.Extensions;
using FluentAssertions;
using Xunit;

namespace Automation.Pipeline.Tests;

public class SemanticJsonPathTests
{
    private const string SampleJson = """
    {
        "asset_name": "Genesis9_Eva",
        "video": {
            "resolution": {
                "width": 1920,
                "height": 1080
            },
            "fps": 60
        },
        "streams": [
            { "type": "video", "codec": "h264" },
            { "type": "audio", "codec": "aac", "channels": 2 }
        ],
        "slots": [
            {
                "index": 0,
                "name": "Body",
                "textures": {
                    "BASE_COLOR": "textures/body_bc.png",
                    "NORMAL": "textures/body_n.png"
                }
            },
            {
                "index": 1,
                "name": "Trim-1",
                "textures": {
                    "BASE_COLOR": "textures/trim1_bc.png",
                    "NORMAL": "textures/trim1_n.png",
                    "ART": "textures/trim1_art.png"
                }
            },
            {
                "index": 2,
                "name": "Body.001",
                "textures": {
                    "BASE_COLOR": "textures/body_special.png"
                }
            }
        ],
        "simple_tags": ["hero", "cloth", "female"]
    }
    """;

    private readonly JsonElement _root;

    public SemanticJsonPathTests()
    {
        using var doc = JsonDocument.Parse(SampleJson);
        _root = doc.RootElement.Clone();
    }

    [Fact]
    public void ExtractJsonValue_DirectProperty_ReturnsValue()
    {
        var val = _root.ExtractJsonValue("asset_name");
        val.Should().Be("Genesis9_Eva");
    }

    [Fact]
    public void ExtractJsonValue_NestedDottedPath_ReturnsValue()
    {
        var width = _root.ExtractJsonValue("video.resolution.width");
        width.Should().Be(1920L);

        var fps = _root.ExtractJsonValue("video.fps");
        fps.Should().Be(60L);
    }

    [Fact]
    public void ExtractJsonValue_ArrayIndex_ReturnsValue()
    {
        var bodyName = _root.ExtractJsonValue("slots[0].name");
        bodyName.Should().Be("Body");

        var trimBc = _root.ExtractJsonValue("slots[1].textures.BASE_COLOR");
        trimBc.Should().Be("textures/trim1_bc.png");
    }

    [Fact]
    public void ExtractJsonValue_SemanticPredicateSingleQuote_ReturnsMatchedElement()
    {
        var trimName = _root.ExtractJsonValue("slots[name='Trim-1'].name");
        trimName.Should().Be("Trim-1");

        var trimArt = _root.ExtractJsonValue("slots[name='Trim-1'].textures.ART");
        trimArt.Should().Be("textures/trim1_art.png");
    }

    [Fact]
    public void ExtractJsonValue_SemanticPredicateDoubleQuote_ReturnsMatchedElement()
    {
        var trimName = _root.ExtractJsonValue("slots[name=\"Trim-1\"].name");
        trimName.Should().Be("Trim-1");
    }

    [Fact]
    public void ExtractJsonValue_SemanticPredicateCaseInsensitive_ReturnsMatchedElement()
    {
        var trimName = _root.ExtractJsonValue("slots[name='trim-1'].name");
        trimName.Should().Be("Trim-1");
    }

    [Fact]
    public void ExtractJsonValue_SemanticPredicateShorthand_FindsByName()
    {
        var bodyBc = _root.ExtractJsonValue("slots[Body].textures.BASE_COLOR");
        bodyBc.Should().Be("textures/body_bc.png");
    }

    [Fact]
    public void ExtractJsonValue_SemanticPredicateWithDotInValue_ReturnsMatchedElement()
    {
        var specialBc = _root.ExtractJsonValue("slots[name='Body.001'].textures.BASE_COLOR");
        specialBc.Should().Be("textures/body_special.png");
    }

    [Fact]
    public void ExtractJsonValue_SemanticPredicateOtherKey_ReturnsMatchedStream()
    {
        var codec = _root.ExtractJsonValue("streams[type='audio'].codec");
        codec.Should().Be("aac");

        var channels = _root.ExtractJsonValue("streams[type='audio'].channels");
        channels.Should().Be(2L);
    }

    [Fact]
    public void ExtractJsonValue_SemanticPredicateOnObject_ReturnsWholeObject()
    {
        var val = _root.ExtractJsonValue("slots[name='Trim-1']");
        val.Should().BeAssignableTo<IDictionary<string, object?>>();

        var dict = (IDictionary<string, object?>)val!;
        dict["name"].Should().Be("Trim-1");
        dict["textures"].Should().BeAssignableTo<IDictionary<string, object?>>();
    }

    [Fact]
    public void ExtractJsonValue_WildcardArray_ReturnsAllValues()
    {
        var names = _root.ExtractJsonValue("slots[*].name");
        names.Should().BeAssignableTo<IEnumerable<object>>();

        var list = (IEnumerable<object>)names!;
        list.Should().Contain("Body");
        list.Should().Contain("Trim-1");
        list.Should().Contain("Body.001");
    }

    [Fact]
    public void ExtractJsonValue_NonExistentPath_ReturnsNull()
    {
        var nonExistent = _root.ExtractJsonValue("slots[name='NonExistent'].name");
        nonExistent.Should().BeNull();

        var invalidProp = _root.ExtractJsonValue("invalid.prop");
        invalidProp.Should().BeNull();
    }

    [Fact]
    public void ExtractJsonValue_SemanticContainerFallback_MatchesRenamedContainer()
    {
        const string version4Json = """
        {
            "objects": {
                "Laura": {
                    "slots": [
                        { "name": "Eye Left", "textures": { "BASE_COLOR": "tex/eye_bc.png" } },
                        { "name": "Genesis 9 Mesh_baked", "textures": { "BASE_COLOR": "tex/skin_bc.png" } }
                    ]
                }
            }
        }
        """;
        using var doc = JsonDocument.Parse(version4Json);

        // Path originally tagged on version 1 where container was named "Genesis 9 Mouth Mesh"
        var pathFromVersion1 = "objects.Genesis 9 Mouth Mesh.slots[name='Eye Left'].textures.BASE_COLOR";
        var val = doc.RootElement.ExtractJsonValue(pathFromVersion1);

        val.Should().Be("tex/eye_bc.png");
    }
}
