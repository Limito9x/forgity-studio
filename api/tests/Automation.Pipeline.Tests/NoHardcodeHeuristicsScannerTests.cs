using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Engine.StructRegistry;
using Automation.Pipeline.Tools;
using Automation.Pipeline.Tools.Collections;
using Automation.Pipeline.Tools.Construct;
using Automation.Pipeline.Tools.Deconstruct;
using Automation.Pipeline.Tools.Utility;
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
            content.Should().NotContain("BUILTIN_STRUCT_PINS", "The legacy static BUILTIN_STRUCT_PINS array must be completely purged.");
            content.Should().NotContain("\"StorageProfileId\"", "Specific struct fields must not be hardcoded in frontend constants.");
            content.Should().NotContain("getStructPins", "The dead getStructPins helper must be completely removed.");
        }
    }

    [Fact]
    public void FrontendCanvasFiles_MustNotContain_GetStructPinsOrStructToolNameFallbacks()
    {
        var currentDir = AppContext.BaseDirectory;
        var draftStatePath = Path.GetFullPath(Path.Combine(currentDir, "../../../../../../web/src/features/pipelines/components/canvas/hooks/usePipelineDraftState.ts"));
        if (File.Exists(draftStatePath))
        {
            var content = File.ReadAllText(draftStatePath);
            content.Should().NotContain("getStructPins", "usePipelineDraftState must not call getStructPins.");
        }

        var inspectorPath = Path.GetFullPath(Path.Combine(currentDir, "../../../../../../web/src/features/pipelines/components/canvas/NodeConfigInspector.tsx"));
        if (File.Exists(inspectorPath))
        {
            var content = File.ReadAllText(inspectorPath);
            content.Should().NotContain("\"breakstruct\"", "NodeConfigInspector must rely on capabilities.inspectorMode, not tool-name fallbacks.");
            content.Should().NotContain("\"makestruct\"", "NodeConfigInspector must rely on capabilities.inspectorMode, not tool-name fallbacks.");
        }
    }

    [Fact]
    public void CanvasConnectionRulesTs_MustNotContain_StringHeuristicGuessing()
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
    public void DynamicTools_MustAllDeclare_IsDynamicTrue()
    {
        var mockRegistry = NSubstitute.Substitute.For<IEntityStructRegistry>();
        var tools = new IResolverTool[]
        {
            new FormatStringTool(),
            new MakeArrayTool(),
            new AppendStringTool(),
            new BreakStructTool(mockRegistry),
            new MakeStructTool(mockRegistry)
        };

        foreach (var tool in tools)
        {
            tool.IsDynamic.Should().BeTrue($"Tool '{tool.Key}' must declare IsDynamic = true.");
        }
    }

    [Fact]
    public void Enums_MustSerializeToString_NotMagicNumbers()
    {
        // Kiểm tra enum serialization qua System.Text.Json
        var prim = PinPrimitiveType.EntityRef;
        var json = System.Text.Json.JsonSerializer.Serialize(prim);
        json.Should().Be("\"EntityRef\"", "Enums must serialize as String Enum, not integer 4.");

        var card = PinCardinality.Array;
        var cardJson = System.Text.Json.JsonSerializer.Serialize(card);
        cardJson.Should().Be("\"Array\"", "PinCardinality must serialize as String Enum, not integer 1.");
    }
}
