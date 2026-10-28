using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Contracts.StructRegistry;
using Automation.Pipeline.Contracts.StructRegistry.Definitions;
using Automation.Pipeline.Contracts.Tools;
using Automation.Pipeline.Contracts.Tools.Collections;
using Automation.Pipeline.Contracts.Tools.Deconstruct;
using Automation.Pipeline.Contracts.Tools.Utility;
using Automation.Runner.Contracts;
using FluentAssertions;
using FluentResults;
using NSubstitute;
using Xunit;

namespace Automation.Pipeline.Tests;

public class ResolveToolPinsTests
{
    private readonly IEntityStructRegistry _structRegistry;
    private readonly IToolRegistry _toolRegistry;
    private readonly ResolveToolPinsHandler _handler;

    public ResolveToolPinsTests()
    {
        var runnerApi = Substitute.For<IRunnerApi>();
        var runnerDef = new RunnerStructDefinition(runnerApi);
        _structRegistry = new EntityStructRegistry([runnerDef], null);

        var breakStructTool = new BreakStructTool(_structRegistry);
        var formatStringTool = new FormatStringTool();
        var makeArrayTool = new MakeArrayTool();

        _toolRegistry = Substitute.For<IToolRegistry>();
        _toolRegistry.GetByKey(Arg.Any<string>()).Returns((IResolverTool?)null);
        _toolRegistry.GetByKey("BreakStruct").Returns(breakStructTool);
        _toolRegistry.GetByKey("FormatString").Returns(formatStringTool);
        _toolRegistry.GetByKey("MakeArray").Returns(makeArrayTool);

        _handler = new ResolveToolPinsHandler(_toolRegistry, _structRegistry);
    }

    [Fact]
    public async Task HandleAsync_ShouldResolveFormatStringPins_FromTemplate()
    {
        var command = new ResolveToolPinsCommand(
            "FormatString",
            new Dictionary<string, object?>
            {
                ["Template"] = "{character_name}_{lod_level}_{texture_type}"
            }
        );

        var result = await _handler.HandleAsync(command, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var dto = result.Value;
        dto.Inputs.Should().Contain(p => p.Id == "character_name");
        dto.Inputs.Should().Contain(p => p.Id == "lod_level");
        dto.Inputs.Should().Contain(p => p.Id == "texture_type");
        dto.Outputs.Should().Contain(p => p.Id == "Result");
    }

    [Fact]
    public async Task HandleAsync_ShouldResolveBreakStructPins_FromStructType()
    {
        var command = new ResolveToolPinsCommand(
            "BreakStruct",
            new Dictionary<string, object?>
            {
                ["StructType"] = WellKnownStructTypes.Runner
            }
        );

        var result = await _handler.HandleAsync(command, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var dto = result.Value;
        dto.Inputs.Should().Contain(p => p.Id == "Target");
        dto.Outputs.Should().Contain(p => p.Id == "RunnerName" && p.PrimitiveType == PinPrimitiveType.String);
        dto.Outputs.Should().Contain(p => p.Id == "OsPlatform" && p.PrimitiveType == PinPrimitiveType.String);
        dto.Outputs.Should().Contain(p => p.Id == "CpuModel" && p.PrimitiveType == PinPrimitiveType.String);
        dto.Outputs.Should().Contain(p => p.Id == "MachineKey" && p.PrimitiveType == PinPrimitiveType.String);
    }

    [Fact]
    public async Task HandleAsync_BreakStruct_WhenStructTypeUnselected_ShouldReturnOnlyTargetInputAndEmptyOutputs()
    {
        var command = new ResolveToolPinsCommand("BreakStruct", new Dictionary<string, object?>());

        var result = await _handler.HandleAsync(command, CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        var dto = result.Value;
        dto.Inputs.Select(p => p.Id).Should().Equal("Target");
        dto.Outputs.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleAsync_ShouldReturnFailure_WhenToolNotFound()
    {
        var command = new ResolveToolPinsCommand("NonExistentTool_123");

        var result = await _handler.HandleAsync(command, CancellationToken.None);

        result.IsFailed.Should().BeTrue();
        result.Errors.First().Message.Should().Contain("not found");
    }
}
