using Automation.Pipeline.Contracts.Tools;
using Automation.Pipeline.Contracts.Tools.Utility;
using FluentAssertions;
using Xunit;

namespace Automation.Pipeline.Tests;

public class SplitStringToolTests
{
    private readonly ToolExecutionContext _context = new(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);
    private readonly SplitStringTool _tool = new();

    [Fact]
    public async Task ExecuteAsync_ShouldSplitByUnderscore_ByDefault()
    {
        var inputs = new Dictionary<string, object>
        {
            ["Source"] = "Laura_Outfit1_Bra",
            ["Index"] = 0
        };

        var result = await _tool.ExecuteAsync(inputs, _context);

        result["Result"].Should().Be("Laura");
        result["First"].Should().Be("Laura");
        result["Last"].Should().Be("Bra");
        result["Count"].Should().Be(3);

        var items = result["Items"] as List<string>;
        items.Should().NotBeNull();
        items.Should().Equal("Laura", "Outfit1", "Bra");
    }

    [Fact]
    public async Task ExecuteAsync_ShouldSupportNegativeIndex()
    {
        var inputs = new Dictionary<string, object>
        {
            ["Source"] = "Laura_Outfit1_Bra",
            ["Index"] = -1 // Last item
        };

        var result = await _tool.ExecuteAsync(inputs, _context);

        result["Result"].Should().Be("Bra");
        result["Last"].Should().Be("Bra");
    }

    [Fact]
    public async Task ExecuteAsync_ShouldSupportCustomDelimiter()
    {
        var inputs = new Dictionary<string, object>
        {
            ["Source"] = "Characters/Genesis9/Laura/Outfits",
            ["Delimiter"] = "/",
            ["Index"] = 2
        };

        var result = await _tool.ExecuteAsync(inputs, _context);

        result["Result"].Should().Be("Laura");
        result["First"].Should().Be("Characters");
        result["Last"].Should().Be("Outfits");
        result["Count"].Should().Be(4);
    }

    [Fact]
    public async Task ExecuteAsync_OutOfBounds_ShouldReturnEmptyString_Safely()
    {
        var inputs = new Dictionary<string, object>
        {
            ["Source"] = "Laura",
            ["Index"] = 5
        };

        var result = await _tool.ExecuteAsync(inputs, _context);

        result["Result"].Should().Be(string.Empty);
        result["First"].Should().Be("Laura");
        result["Last"].Should().Be("Laura");
        result["Count"].Should().Be(1);
    }
}

