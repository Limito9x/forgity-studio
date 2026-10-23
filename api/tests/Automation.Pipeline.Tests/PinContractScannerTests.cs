using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Engine.StructRegistry;
using Automation.Pipeline.Tools;
using Automation.Pipeline.Tools.Collections;
using Automation.Pipeline.Tools.Construct;
using Automation.Pipeline.Tools.Deconstruct;
using Automation.Pipeline.Tools.Utility;
using Automation.Pipeline.Tools.Variables;
using Automation.Pipeline.Tools.Workspaces;
using Automation.Content.Contracts;
using Automation.DynamicForms.Contracts;
using Automation.Repository.Contracts;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace Automation.Pipeline.Tests;

public class PinContractScannerTests
{
    private static IResolverTool[] GetAllTestableTools()
    {
        var mockStructRegistry = Substitute.For<IEntityStructRegistry>();
        var mockWorkspaceApi = Substitute.For<IRepositoryApi>();
        var mockContentApi = Substitute.For<IContentApi>();
        var mockSchemaApi = Substitute.For<ISchemaApi>();

        return
        [
            new FormatStringTool(),
            new MakeArrayTool(),
            new AppendStringTool(),
            new MakeMapTool(),
            new GetByPathTool(),
            new BreakContentItemTool(mockContentApi, mockSchemaApi, NullLogger<BreakContentItemTool>.Instance),
            new BreakStructTool(mockStructRegistry),
            new MakeStructTool(mockStructRegistry),
            new CastToStructTool(mockStructRegistry),
            new AssignResourcesToContentTool(mockWorkspaceApi, mockContentApi, NullLogger<AssignResourcesToContentTool>.Instance),
            new GetResourceRelativePathsTool(null, NullLogger<GetResourceRelativePathsTool>.Instance),
            new GetResourceContentTool(mockWorkspaceApi, mockContentApi),
            new SyncLocalChangeToRepositoryTool(mockWorkspaceApi, NullLogger<SyncLocalChangeToRepositoryTool>.Instance),
            new UpdateResourceMetadataTool(mockWorkspaceApi),
            new GetRepositoryInfoTool(mockWorkspaceApi, NullLogger<GetRepositoryInfoTool>.Instance),
            new SetVariableTool(),
            new GetVariableTool()
        ];
    }

    [Fact]
    public void AllDynamicTools_MustDeclareNonEmptySchemaConfigKeys()
    {
        var tools = GetAllTestableTools().Where(t => t.IsDynamic);

        foreach (var tool in tools)
        {
            tool.Capabilities.Should().NotBeNull($"Dynamic tool '{tool.Key}' must declare Capabilities.");
            tool.Capabilities!.SchemaConfigKeys.Should().NotBeNullOrEmpty(
                $"Dynamic tool '{tool.Key}' must declare non-empty Capabilities.SchemaConfigKeys.");
        }
    }

    [Fact]
    public void StructTools_UnselectedState_ShouldNotPreloadDefaultStructPins()
    {
        var mockStructRegistry = Substitute.For<IEntityStructRegistry>();

        var breakStruct = new BreakStructTool(mockStructRegistry);
        breakStruct.Inputs.Select(p => p.Id).Should().Equal("StructType");
        breakStruct.Outputs.Should().BeEmpty();

        var makeStruct = new MakeStructTool(mockStructRegistry);
        makeStruct.Inputs.Select(p => p.Id).Should().Equal("StructType");
        makeStruct.Outputs.Should().BeEmpty();
    }

    [Fact]
    public void AllTools_EntityRefPins_MustDeclarePascalCaseStructType()
    {
        var tools = GetAllTestableTools();

        foreach (var tool in tools)
        {
            var allPins = tool.Inputs.Concat(tool.Outputs);
            foreach (var pin in allPins)
            {
                if (pin.PrimitiveType == PinPrimitiveType.EntityRef)
                {
                    pin.StructType.Should().NotBeNullOrWhiteSpace(
                        $"Tool '{tool.Key}' pin '{pin.Id}' is EntityRef but StructType is null or whitespace.");

                    char.IsUpper(pin.StructType![0]).Should().BeTrue(
                        $"Tool '{tool.Key}' pin '{pin.Id}' StructType '{pin.StructType}' must be PascalCase.");
                }
            }
        }
    }

    [Fact]
    public void DynamicCollectionTools_MustDeclareCapabilities_WithExpectedVariants()
    {
        var mockStructRegistry = Substitute.For<IEntityStructRegistry>();

        var makeArray = new MakeArrayTool();
        makeArray.Capabilities.Should().NotBeNull();
        makeArray.Capabilities!.ViewVariant.Should().Be("Collection");
        makeArray.Capabilities!.PinAddMode.Should().Be("Sequence");
        makeArray.Capabilities!.CanAddPin.Should().BeTrue();
        makeArray.Capabilities!.CanRemovePin.Should().BeTrue();

        var appendString = new AppendStringTool();
        appendString.Capabilities.Should().NotBeNull();
        appendString.Capabilities!.ViewVariant.Should().Be("Collection");
        appendString.Capabilities!.PinAddMode.Should().Be("Alpha");
        appendString.Capabilities!.CanAddPin.Should().BeTrue();
        appendString.Capabilities!.CanRemovePin.Should().BeTrue();

        var breakStruct = new BreakStructTool(mockStructRegistry);
        breakStruct.Capabilities.Should().NotBeNull();
        breakStruct.Capabilities!.ViewVariant.Should().Be("Struct");
        breakStruct.Capabilities!.InspectorMode.Should().Be("StructSelector");

        var makeStruct = new MakeStructTool(mockStructRegistry);
        makeStruct.Capabilities.Should().NotBeNull();
        makeStruct.Capabilities!.ViewVariant.Should().Be("Struct");
        makeStruct.Capabilities!.InspectorMode.Should().Be("StructSelector");

        var formatString = new FormatStringTool();
        formatString.Capabilities.Should().NotBeNull();
        formatString.Capabilities!.ViewVariant.Should().Be("Standard");
        formatString.Capabilities!.InspectorMode.Should().Be("FormatTemplate");
    }

    [Fact]
    public void ProtectedPinIds_MustBeValidInputPins()
    {
        var tools = GetAllTestableTools();

        foreach (var tool in tools)
        {
            if (tool.Capabilities?.ProtectedPinIds is { Count: > 0 } protectedIds)
            {
                var inputIds = tool.Inputs.Select(p => p.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
                foreach (var id in protectedIds)
                {
                    inputIds.Should().Contain(id,
                        $"Tool '{tool.Key}' declares protected pin '{id}', which must exist in tool.Inputs.");
                }
            }
        }
    }

    [Fact]
    public void WellKnownStructTypes_MustBeStrictPascalCase()
    {
        var fields = typeof(WellKnownStructTypes)
            .GetFields(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static)
            .Where(f => f.IsLiteral && !f.IsInitOnly && f.FieldType == typeof(string));

        foreach (var field in fields)
        {
            var value = (string)field.GetValue(null)!;
            value.Should().NotBeNullOrWhiteSpace($"WellKnownStructTypes.{field.Name} value must not be empty.");
            char.IsUpper(value[0]).Should().BeTrue($"WellKnownStructTypes.{field.Name} value '{value}' must start with an uppercase letter (PascalCase).");
        }
    }
}
