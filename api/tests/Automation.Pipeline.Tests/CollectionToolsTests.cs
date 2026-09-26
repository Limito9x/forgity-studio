using Automation.Pipeline.Tools;
using Automation.Pipeline.Tools.Collections;
using Automation.Pipeline.Tools.Utility;
using FluentAssertions;
using Xunit;

namespace Automation.Pipeline.Tests;

public class CollectionToolsTests
{
    private readonly ToolExecutionContext _context = new(Guid.NewGuid(), Guid.NewGuid(), Guid.Empty, CancellationToken.None);

    [Fact]
    public async Task GetMapKeysTool_ShouldExtractAllKeys()
    {
        var tool = new GetMapKeysTool();
        var inputs = new Dictionary<string, object>
        {
            ["Map"] = new Dictionary<string, object?> { ["Head"] = "head.fbx", ["Body"] = "body.fbx" }
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        result["Keys"].Should().BeEquivalentTo(new[] { "Head", "Body" });
    }

    [Fact]
    public async Task GetMapValuesTool_ShouldExtractAllValues()
    {
        var tool = new GetMapValuesTool();
        var inputs = new Dictionary<string, object>
        {
            ["Map"] = new Dictionary<string, object?> { ["Head"] = "head.fbx", ["Body"] = "body.fbx" }
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        result["Values"].Should().BeEquivalentTo(new[] { "head.fbx", "body.fbx" });
    }

    [Fact]
    public async Task GetMapItemTool_ShouldReturnValueByKey()
    {
        var tool = new GetMapItemTool();
        var inputs = new Dictionary<string, object>
        {
            ["Map"] = new Dictionary<string, object?> { ["Head"] = "head.fbx", ["Weapon"] = "sword.fbx" },
            ["Key"] = "Weapon"
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        result["Found"].Should().Be(true);
        result["Value"].Should().Be("sword.fbx");
    }

    [Fact]
    public async Task GetMapItemTool_NotFound_ShouldReturnDefaultValue()
    {
        var tool = new GetMapItemTool();
        var inputs = new Dictionary<string, object>
        {
            ["Map"] = new Dictionary<string, object?> { ["Head"] = "head.fbx" },
            ["Key"] = "Shield",
            ["DefaultValue"] = "default_shield.fbx"
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        result["Found"].Should().Be(false);
        result["Value"].Should().Be("default_shield.fbx");
    }

    [Fact]
    public async Task GetArrayItemTool_ShouldReturnItemByIndex()
    {
        var tool = new GetArrayItemTool();
        var inputs = new Dictionary<string, object>
        {
            ["Array"] = new[] { "MeshA", "MeshB", "MeshC" },
            ["Index"] = 1
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        result["Found"].Should().Be(true);
        result["Item"].Should().Be("MeshB");
    }

    [Fact]
    public async Task GetArrayItemTool_NegativeIndex_ShouldReturnFromEnd()
    {
        var tool = new GetArrayItemTool();
        var inputs = new Dictionary<string, object>
        {
            ["Array"] = new[] { "MeshA", "MeshB", "MeshC" },
            ["Index"] = -1
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        result["Found"].Should().Be(true);
        result["Item"].Should().Be("MeshC");
    }

    [Fact]
    public async Task GetCollectionCountTool_ShouldReturnAccurateCount()
    {
        var tool = new GetCollectionCountTool();
        var inputs = new Dictionary<string, object>
        {
            ["Collection"] = new[] { "A", "B", "C", "D" }
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        result["Count"].Should().Be(4);
    }

    [Fact]
    public async Task ZipToMapTool_ShouldCombineKeysAndValues()
    {
        var tool = new ZipToMapTool();
        var inputs = new Dictionary<string, object>
        {
            ["Keys"] = new[] { "Head", "Weapon" },
            ["Values"] = new[] { "head.glb", "sword.glb" }
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        var map = result["Map"] as Dictionary<string, object?>;
        map.Should().NotBeNull();
        map!["Head"].Should().Be("head.glb");
        map!["Weapon"].Should().Be("sword.glb");
    }

    [Fact]
    public async Task MakeMapTool_ShouldCreateSingleEntryMap()
    {
        var tool = new MakeMapTool();
        var inputs = new Dictionary<string, object>
        {
            ["Key_0"] = "Diffuse",
            ["Value_0"] = "diffuse.png"
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        var map = result["Map"] as Dictionary<string, string>;
        map.Should().NotBeNull();
        map!["Diffuse"].Should().Be("diffuse.png");
    }

    [Fact]
    public async Task MergeMapsTool_ShouldMergeMapsAndOverrideDuplicates()
    {
        var tool = new MergeMapsTool();
        var inputs = new Dictionary<string, object>
        {
            ["MapA"] = new Dictionary<string, object?> { ["A"] = 1, ["B"] = 2 },
            ["MapB"] = new Dictionary<string, object?> { ["B"] = 20, ["C"] = 3 }
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        var map = result["Map"] as Dictionary<string, object?>;
        map.Should().NotBeNull();
        map!["A"].Should().Be(1);
        map!["B"].Should().Be(20);
        map!["C"].Should().Be(3);
    }

    [Fact]
    public async Task RemapKeysTool_ShouldTranslateKeysUsingKeyMap()
    {
        var tool = new RemapKeysTool();
        var inputs = new Dictionary<string, object>
        {
            ["DataMap"] = new Dictionary<string, object?>
            {
                ["Shirt"] = new { slot = "Mat_Shirt" },
                ["Shorts"] = new { slot = "Mat_Shorts" }
            },
            ["KeyMap"] = new Dictionary<string, object?>
            {
                ["Shirt"] = "D:/Path/Shirt.fbx",
                ["Shorts"] = "D:/Path/Shorts.fbx"
            }
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        var map = result["ResultMap"] as Dictionary<string, object?>;
        map.Should().NotBeNull();
        map!.Should().ContainKey("D:/Path/Shirt.fbx");
        map.Should().ContainKey("D:/Path/Shorts.fbx");
        map.Should().NotContainKey("Shirt");
    }

    [Fact]
    public async Task RemapKeysTool_KeepUnmatchedFalse_ShouldOmitUnmappedKeys()
    {
        var tool = new RemapKeysTool();
        var inputs = new Dictionary<string, object>
        {
            ["DataMap"] = new Dictionary<string, object?>
            {
                ["Shirt"] = "val_shirt",
                ["Shoes"] = "val_shoes"
            },
            ["KeyMap"] = new Dictionary<string, object?>
            {
                ["Shirt"] = "D:/Path/Shirt.fbx"
            },
            ["KeepUnmatched"] = false
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        var map = result["ResultMap"] as Dictionary<string, object?>;
        map.Should().NotBeNull();
        map!.Should().ContainKey("D:/Path/Shirt.fbx");
        map.Should().NotContainKey("Shoes");
    }

    [Fact]
    public async Task RemapKeysTool_KeepUnmatchedTrue_ShouldPreserveUnmappedKeys()
    {
        var tool = new RemapKeysTool();
        var inputs = new Dictionary<string, object>
        {
            ["DataMap"] = new Dictionary<string, object?>
            {
                ["Shirt"] = "val_shirt",
                ["Shoes"] = "val_shoes"
            },
            ["KeyMap"] = new Dictionary<string, object?>
            {
                ["Shirt"] = "D:/Path/Shirt.fbx"
            },
            ["KeepUnmatched"] = true
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        var map = result["ResultMap"] as Dictionary<string, object?>;
        map.Should().NotBeNull();
        map!.Should().ContainKey("D:/Path/Shirt.fbx");
        map.Should().ContainKey("Shoes");
        map!["Shoes"].Should().Be("val_shoes");
    }

    [Fact]
    public async Task RemapKeysTool_WhenKeyMapContainsEntityReference_ShouldExtractGuidString()
    {
        var tool = new RemapKeysTool();
        var targetGuid = Guid.NewGuid();
        var inputs = new Dictionary<string, object>
        {
            ["DataMap"] = new Dictionary<string, object?>
            {
                ["outfits/shirt.fbx"] = new { slot = "Shirt" }
            },
            ["KeyMap"] = new Dictionary<string, object?>
            {
                ["outfits/shirt.fbx"] = new Dictionary<string, object?>
                {
                    ["$type"] = "ResourceVersion",
                    ["$ref"] = targetGuid.ToString()
                }
            }
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        var map = result["ResultMap"] as Dictionary<string, object?>;
        map.Should().NotBeNull();
        map!.Should().ContainKey(targetGuid.ToString());
        map.Should().NotContainKey("outfits/shirt.fbx");
    }

    [Fact]
    public async Task SetMapKeyTool_PureExecution_ShouldReturnUpdatedMap()
    {
        var tool = new SetMapItemTool();
        var inputs = new Dictionary<string, object>
        {
            ["TargetMap"] = new Dictionary<string, object?> { ["Diffuse"] = "diff.png" },
            ["Key"] = "Normal",
            ["Value"] = "norm.png"
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        var resultMap = result["Result"] as Dictionary<string, object?>;
        resultMap.Should().NotBeNull();
        resultMap!["Diffuse"]?.ToString().Should().Be("diff.png");
        resultMap["Normal"]?.ToString().Should().Be("norm.png");
        result.Should().ContainKey("Result Map");
    }

    [Fact]
    public async Task AppendMapTool_ShouldMergeTwoMaps()
    {
        var tool = new MergeMapsTool();
        var inputs = new Dictionary<string, object>
        {
            ["TargetMap"] = new Dictionary<string, object?> { ["A"] = "1" },
            ["SourceMap"] = new Dictionary<string, object?> { ["B"] = "2" }
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        var resultMap = result["Result"] as Dictionary<string, object?>;
        resultMap.Should().NotBeNull();
        resultMap!["A"]?.ToString().Should().Be("1");
        resultMap["B"]?.ToString().Should().Be("2");
    }

    [Fact]
    public async Task CombinePathTool_ShouldNormalizeAndCombineSegments()
    {
        var tool = new CombinePathTool();
        var inputs = new Dictionary<string, object>
        {
            ["BasePath"] = "C:\\Projects\\Game",
            ["SubFolder"] = "Content\\Textures",
            ["FileName"] = "T_Hero_BC",
            ["Extension"] = "png"
        };

        var result = await tool.ExecuteAsync(inputs, _context);

        result["FullPath"].Should().Be("C:/Projects/Game/Content/Textures/T_Hero_BC.png");
    }
}

