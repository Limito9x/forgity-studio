using System.Collections.Generic;
using System.Threading.Tasks;
using Automation.Pipeline.Contracts.Tools;
using Automation.Pipeline.Contracts.Tools.Utility;
using FluentAssertions;
using Xunit;

namespace Automation.Pipeline.Tests;

public class FormatStringPipelineTests
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
}
