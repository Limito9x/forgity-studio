using Automation.Pipeline.BuildTime.Services;
using Automation.Pipeline.Domain.Enums;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Automation.Pipeline.Tests;

public class NativePythonScriptAnalyzerTests
{
    private const string SampleScriptWithLiteral = """"
        from typing import Literal, List, Dict
        import openai

        def main(
            prompt: str,
            model: Literal["gpt-4o", "gpt-3.5-turbo"] = "gpt-4o",
            temperature: float = 0.7,
            is_json: bool = True
        ) -> dict:
            """
            AI completion generator node.

            Args:
                prompt: The input prompt
            """
            items: List[str] = []
            return {
                "output_items": items
            }

        if __name__ == "__main__":
            pass
        """";

    private const string SimpleScriptForTreeSitter = """"
        def main(prompt: str, temperature: float = 0.7) -> dict:
            """Simple node."""
            items = []
            return {
                "output_items": items
            }
        """";

    [Fact]
    public async Task AnalyzeAsync_WithValidScript_ExtractsOptionsCardinalityAndDependencies()
    {
        var analyzer = new NativePythonScriptAnalyzer();

        var result = await analyzer.AnalyzeAsync(SampleScriptWithLiteral, "ai_generate.py");

        result.Should().NotBeNull();
        result.SuggestedName.Should().Be("ai_generate");
        result.Inputs.Should().HaveCount(4);

        // Check Literal select options
        var modelPin = result.Inputs.FirstOrDefault(p => p.Id == "model");
        modelPin.Should().NotBeNull();
        modelPin!.DefaultValue.Should().Be("gpt-4o");
        modelPin.Metadata.Should().NotBeNullOrWhiteSpace();
        modelPin.Metadata.Should().Contain("select");
        modelPin.Metadata.Should().Contain("gpt-4o");
        modelPin.Metadata.Should().Contain("gpt-3.5-turbo");

        // Check types
        var tempPin = result.Inputs.FirstOrDefault(p => p.Id == "temperature");
        tempPin.Should().NotBeNull();
        tempPin!.PrimitiveType.Should().Be(PinPrimitiveType.Number);

        var jsonPin = result.Inputs.FirstOrDefault(p => p.Id == "is_json");
        jsonPin.Should().NotBeNull();
        jsonPin!.PrimitiveType.Should().Be(PinPrimitiveType.Boolean);

        // Check output cardinality
        var outputPin = result.Outputs.FirstOrDefault(p => p.Id == "output_items");
        outputPin.Should().NotBeNull();
        outputPin!.Cardinality.Should().Be(PinCardinality.Array);

        // Check dependencies
        result.Dependencies.Should().NotBeNull();
        result.Dependencies!.Select(d => d.PackageName).Should().Contain("openai");
    }

    [Fact]
    public async Task HybridAnalyzeAsync_WhenPythonFails_GracefullyFallsBackToTreeSitter()
    {
        // Point to an invalid python executable to force failure
        var brokenNativeAnalyzer = new NativePythonScriptAnalyzer(
            customPythonPath: "invalid_non_existent_python_binary_xyz_123");

        var hybrid = new HybridScriptSchemaAnalyzer(
            brokenNativeAnalyzer,
            NullLogger<HybridScriptSchemaAnalyzer>.Instance);

        // Should NOT throw exception, should return fallback schema from TreeSitter
        var result = await hybrid.AnalyzeAsync(SimpleScriptForTreeSitter, "ai_fallback.py");

        result.Should().NotBeNull();
        result.SuggestedName.Should().Be("ai_fallback");
        result.Inputs.Should().NotBeEmpty();
        result.Outputs.Should().NotBeEmpty();
    }

    [Fact]
    public async Task AnalyzeAsync_WithCancellationToken_CancelsPromptly()
    {
        var analyzer = new NativePythonScriptAnalyzer();
        using var cts = new CancellationTokenSource();
        cts.Cancel(); // Pre-cancelled

        var act = async () => await analyzer.AnalyzeAsync(SampleScriptWithLiteral, "cancel_test.py", cts.Token);

        await act.Should().ThrowAsync<OperationCanceledException>();
    }

    [Fact]
    public async Task AnalyzeAsync_WithRealWorldClassifyMeshTypes_ExtractsSelectOptionsAndOpenAIDependency()
    {
        var analyzer = new NativePythonScriptAnalyzer();
        var baseDir = AppContext.BaseDirectory;
        var dir = new DirectoryInfo(baseDir);
        string? scriptPath = null;
        for (int i = 0; i < 6 && dir != null; i++)
        {
            var p = Path.Combine(dir.FullName, "pipeline-scripts", "ai", "classify_mesh_types.py");
            if (File.Exists(p)) { scriptPath = p; break; }
            dir = dir.Parent;
        }

        if (scriptPath != null)
        {
            var code = await File.ReadAllTextAsync(scriptPath);
            var result = await analyzer.AnalyzeAsync(code, "classify_mesh_types.py");

            result.Should().NotBeNull();
            result.SuggestedName.Should().Be("classify_mesh_types");
            result.Inputs.Should().Contain(p => p.Id == "provider" && p.Metadata != null && p.Metadata.Contains("gemini"));
            result.Inputs.Should().Contain(p => p.Id == "contracts" && p.Metadata != null && p.Metadata.Contains("Top"));
            result.Outputs.Should().Contain(p => p.Id == "body_meshes" && p.Cardinality == PinCardinality.Array);
            result.Outputs.Should().Contain(p => p.Id == "cloth_map" && p.Cardinality == PinCardinality.Map);
            result.Dependencies.Should().Contain(d => d.PackageName == "openai");
        }
    }
}

