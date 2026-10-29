using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Contracts.StructRegistry;
using Automation.Pipeline.Contracts.Tools;
using Automation.Pipeline.Contracts.Tools.Struct;
using Automation.Pipeline.Contracts.Tools.Utility;
using FluentAssertions;
using Xunit;

namespace Automation.Pipeline.Tests;

public class NoHardcodeHeuristicsScannerTests
{
    [Fact]
    public void StructPinsTs_MustNotContain_LegacyStaticArray()
    {
        // Đường dẫn tương đối từ test directory tới structPins.ts
        var currentDir = AppContext.BaseDirectory;
        // Đi lên tới Automation root
        var rootDir = Path.GetFullPath(Path.Combine(currentDir, "../../../../../../web/src/features/pipelines/components/canvas/constants/structPins.ts"));

        if (File.Exists(rootDir))
        {
            var content = File.ReadAllText(rootDir);
            content.Should().NotContain("export const STRUCT_PINS", "Static STRUCT_PINS dictionary was abolished by ADR-004.");
            content.Should().NotContain("Resource:", "Static struct definitions must be registered via IEntityStructRegistry, not hardcoded in TS.");
        }
    }

    [Fact]
    public void UseCanvasConnectionRules_MustNotContain_HardcodedStructNames()
    {
        var currentDir = AppContext.BaseDirectory;
        var rulesPath = Path.GetFullPath(Path.Combine(currentDir, "../../../../../../web/src/features/pipelines/components/canvas/hooks/useCanvasConnectionRules.ts"));

        if (File.Exists(rulesPath))
        {
            var content = File.ReadAllText(rulesPath);
            content.Should().NotContain(".includes(\"repo\")", "Connection rules must not guess structs by matching 'repo' substrings.");
            content.Should().NotContain(".includes(\"resource\")", "Connection rules must not guess structs by matching 'resource' substrings.");
        }
    }

    [Fact]
    public void DynamicPinTools_MustAllDeclare_HasDynamicPinsTrue()
    {
        var mockRegistry = NSubstitute.Substitute.For<IEntityStructRegistry>();
        var tools = new IResolverTool[]
        {
            new FormatStringTool(),
            new BreakStructTool(mockRegistry)
        };

        foreach (var tool in tools)
        {
            tool.HasDynamicPins.Should().BeTrue($"Tool '{tool.Key}' must declare HasDynamicPins = true.");
        }
    }

    [Fact]
    public void Enums_MustSerializeToString_NotMagicNumbers()
    {
        // Kiểm tra enum serialization qua System.Text.Json
        var prim = PinPrimitiveType.EntityRef;
        var options = new System.Text.Json.JsonSerializerOptions();
        options.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());

        var json = System.Text.Json.JsonSerializer.Serialize(prim, options);
        json.Should().Be("\"EntityRef\"", "Enums must be string-serialized across API boundaries.");
    }
}
