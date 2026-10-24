using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.BuildTime.Parsers;
using FluentAssertions;
using Xunit;

namespace Automation.Pipeline.Tests;

public class PythonScriptSchemaParserTests
{
    [Fact]
    public void Parse_ScriptWithHelperFunctions_ShouldOnlyExtractMainReturnOutputs()
    {
        var scriptContent = """
            def extract_helper(data):
                return {
                    "field1": 1,
                    "field2": 2,
                    "field3": 3,
                    "field4": 4,
                    "field5": 5,
                    "field6": 6,
                    "field7": 7,
                    "field8": 8,
                    "field9": 9
                }

            def main(input_path: str) -> dict:
                data = extract_helper(input_path)
                return {
                    "metadata": data
                }

            if __name__ == "__main__":
                pass
            """;

        var result = PythonScriptSchemaParser.Parse(scriptContent, "daz_inspector.py");

        result.Inputs.Should().HaveCount(1);
        result.Inputs[0].Id.Should().Be("input_path");

        result.Outputs.Should().HaveCount(1);
        result.Outputs[0].Id.Should().Be("metadata");
    }

    [Fact]
    public void Parse_ScriptWithNestedHelperInsideMain_ShouldOnlyExtractMainReturnOutputs()
    {
        var scriptContent = """
            def main(target_objects: list = None, clean_unused: bool = True) -> dict:
                def _process_obj_slots(obj):
                    return {
                        "object_name": "name",
                        "slot_count": 2,
                        "slots": []
                    }
                result = {}
                return {
                    "objects": result
                }
            """;

        var result = PythonScriptSchemaParser.Parse(scriptContent, "inspect_separated_meshes.py");

        result.Inputs.Should().HaveCount(2);
        result.Inputs[0].Id.Should().Be("target_objects");
        result.Inputs[1].Id.Should().Be("clean_unused");

        result.Outputs.Should().HaveCount(1);
        result.Outputs[0].Id.Should().Be("objects");
        result.Outputs[0].Cardinality.Should().Be(PinCardinality.Map);
    }

    [Fact]
    public void Parse_InspectSeparatedMeshesActualFile_ShouldExtractCleanPins()
    {
        var filePath = @"d:\FullStack\Automation\Automation-Agent\worker\scripts\inspectors\blender\inspect_separated_meshes.py";
        if (File.Exists(filePath))
        {
            var content = File.ReadAllText(filePath);
            var result = PythonScriptSchemaParser.Parse(content, "inspect_separated_meshes.py");

            result.Inputs.Should().Contain(p => p.Id == "target_objects");
            result.Inputs.Should().Contain(p => p.Id == "clean_unused");
            result.Outputs.Should().HaveCount(1);
            result.Outputs[0].Id.Should().Be("objects");
            result.Outputs[0].Cardinality.Should().Be(PinCardinality.Map);
        }
    }

    [Fact]
    public void Parse_BatchExportFbxActualFile_ShouldExtractExportMapPin()
    {
        var filePath = @"d:\FullStack\Automation\Automation-Agent\worker\scripts\pipeline\blender\batch_export_fbx.py";
        if (File.Exists(filePath))
        {
            var content = File.ReadAllText(filePath);
            var result = PythonScriptSchemaParser.Parse(content, "batch_export_fbx.py");

            result.Inputs.Should().Contain(p => p.Id == "export_map");
            result.Outputs.Should().Contain(p => p.Id == "export_map" && p.Cardinality == PinCardinality.Map);
        }
    }

    [Fact]
    public void Parse_ClassifyMaterialManifest_ShouldExtractCleanPinsAndPythonExecutor()
    {
        var filePath = @"d:\FullStack\Automation\workers\pipelines\ai\classify_material_manifest.py";
        if (File.Exists(filePath))
        {
            var content = File.ReadAllText(filePath);
            var result = PythonScriptSchemaParser.Parse(content, "classify_material_manifest.py");

            result.Executor.Should().Be("python");
            result.SuggestedLabel.Should().Be("Classify Material Manifest");
            result.Inputs.Should().Contain(p => p.Id == "raw_manifest");
            result.Inputs.Should().Contain(p => p.Id == "provider");
            result.Inputs.Should().Contain(p => p.Id == "model");
            result.Outputs.Should().Contain(p => p.Id == "manifest");
            result.Outputs.Should().Contain(p => p.Id == "objects_map");
            result.Outputs.Should().Contain(p => p.Id == "summary");
        }
    }
}
