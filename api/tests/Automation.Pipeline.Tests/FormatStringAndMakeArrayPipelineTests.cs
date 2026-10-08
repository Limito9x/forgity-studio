using System.Collections.Generic;
using System.Threading.Tasks;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Tools;
using Automation.Pipeline.Tools.Collections;
using Automation.Pipeline.Tools.Utility;
using FluentAssertions;
using Xunit;

namespace Automation.Pipeline.Tests;

public class FormatStringAndMakeArrayPipelineTests
{
    [Fact]
    public async Task FormatString_ShouldResolveTokens_AndSanitizePathCorrectly()
    {
        // ARRANGE
        var tool = new FormatStringTool();
        var inputs = new Dictionary<string, object>
        {
            ["Template"] = "{root}/{relative}",
            ["root"] = "C:/Users/congt/OneDrive/Documents/DAZ 3D/Studio/My Library/Scenes/GameRepo",
            ["relative"] = "Scenes/Characters/Eva.duf"
        };
        var context = new ToolExecutionContext(Guid.NewGuid(), Guid.NewGuid(), System.Threading.CancellationToken.None);

        // ACT
        var outputs = await tool.ExecuteAsync(inputs, context);

        // ASSERT
        outputs.Should().ContainKey("Result");
        outputs["Result"].Should().Be("C:/Users/congt/OneDrive/Documents/DAZ 3D/Studio/My Library/Scenes/GameRepo/Scenes/Characters/Eva.duf");
    }

    [Fact]
    public async Task MakeArray_ShouldAppendItem_SupportingBothUnderscoreAndSpacePinNames()
    {
        // ARRANGE
        var tool = new MakeArrayTool();
        var context = new ToolExecutionContext(Guid.NewGuid(), Guid.NewGuid(), System.Threading.CancellationToken.None);

        // Lần 1: Mảng ban đầu rỗng, thêm Item_2
        var inputs1 = new Dictionary<string, object>
        {
            ["Items"] = new string[0],
            ["Item_2"] = "C:/Repo/Scene1.duf"
        };

        var output1 = await tool.ExecuteAsync(inputs1, context);
        var result1 = output1["Result"] as string[];

        // Lần 2: Mảng đã có 1 item, thêm tiếp với pin có space "Item 2"
        var inputs2 = new Dictionary<string, object>
        {
            ["Items"] = result1!,
            ["Item 2"] = "C:/Repo/Scene2.duf"
        };

        var output2 = await tool.ExecuteAsync(inputs2, context);
        var result2 = output2["Result"] as string[];

        // ASSERT
        result1.Should().NotBeNull().And.HaveCount(1);
        result1![0].Should().Be("C:/Repo/Scene1.duf");

        result2.Should().NotBeNull().And.HaveCount(2);
        result2![0].Should().Be("C:/Repo/Scene1.duf");
        result2![1].Should().Be("C:/Repo/Scene2.duf");
    }

    [Fact]
    public void FormatString_ResolvePins_ShouldExtractDynamicPinsFromTemplate()
    {
        // ARRANGE
        var tool = new FormatStringTool();
        var config = new Dictionary<string, object?>
        {
            ["Template"] = "{root}/{relative}"
        };

        // ACT
        var (inputs, outputs) = tool.ResolvePins(config);

        // ASSERT
        inputs.Should().Contain(p => p.Id == "Template");
        inputs.Should().Contain(p => p.Id == "root");
        inputs.Should().Contain(p => p.Id == "relative");
        outputs.Should().Contain(p => p.Id == "Result");
    }

    [Fact]
    public async Task FullForEachLoop_ShouldAccumulateFormattedPaths_OverMultipleIterations()
    {
        // ARRANGE: Giả lập 3 Resource items từ ForEach
        var resourceItems = new[]
        {
            new { RelativePath = "Scenes/Room1.duf" },
            new { RelativePath = "Scenes/Room2.duf" },
            new { RelativePath = "Scenes/Room3.duf" }
        };
        var rootPath = "C:/Daz/GameRepo";

        var formatTool = new FormatStringTool();
        var makeArrayTool = new MakeArrayTool();
        var context = new ToolExecutionContext(Guid.NewGuid(), Guid.NewGuid(), System.Threading.CancellationToken.None);

        // Biến Daz Paths ban đầu là rỗng
        var accumulatedPaths = new string[0];

        // ACT: Lặp qua từng item giống hệt cách ForEachDispatcher hoạt động
        foreach (var item in resourceItems)
        {
            // 1. FormatString kết hợp RootPath và RelativePath của item
            var formatOutputs = await formatTool.ExecuteAsync(new Dictionary<string, object>
            {
                ["Template"] = "{root}/{relative}",
                ["root"] = rootPath,
                ["relative"] = item.RelativePath
            }, context);

            var formattedPath = formatOutputs["Result"].ToString()!;

            // 2. MakeArray nhận mảng cũ (từ GetVariable) và item mới (Item_2)
            var makeOutputs = await makeArrayTool.ExecuteAsync(new Dictionary<string, object>
            {
                ["Items"] = accumulatedPaths,
                ["Item_2"] = formattedPath
            }, context);

            accumulatedPaths = (string[])makeOutputs["Result"];
        }

        // ASSERT
        accumulatedPaths.Should().HaveCount(3);
        accumulatedPaths[0].Should().Be("C:/Daz/GameRepo/Scenes/Room1.duf");
        accumulatedPaths[1].Should().Be("C:/Daz/GameRepo/Scenes/Room2.duf");
        accumulatedPaths[2].Should().Be("C:/Daz/GameRepo/Scenes/Room3.duf");
    }
}
