using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Tools;
using Automation.Pipeline.Tools.Attributes;
using FluentAssertions;
using Xunit;

namespace Automation.Pipeline.Tests;

public class BaseResolverToolTests
{
    private readonly ToolExecutionContext _context = new(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

    public class SampleInputs
    {
        public string Title { get; set; } = string.Empty;
        public int Count { get; set; }
        public double Factor { get; set; }
        public bool IsActive { get; set; }
        public Guid ItemId { get; set; }
        public List<string> Tags { get; set; } = [];
        public Dictionary<string, string> Configs { get; set; } = [];

        [ToolPin(Id = "CustomAlias")]
        public string RenamedField { get; set; } = string.Empty;

        [ToolPinIgnore]
        public string IgnoredField { get; set; } = "Ignored";
    }

    public class SampleOutputs
    {
        public string FullMessage { get; set; } = string.Empty;
        public int TotalCount { get; set; }
        public Dictionary<string, string> MergedConfigs { get; set; } = [];
    }

    public class SampleTool : BaseResolverTool<SampleInputs, SampleOutputs>
    {
        public override string Key => "SampleTool";
        public override string Label => "Sample Tool";
        public override bool IsPure => true;

        protected override Task<SampleOutputs> ExecuteCoreAsync(SampleInputs input, ToolExecutionContext context)
        {
            return Task.FromResult(new SampleOutputs
            {
                FullMessage = $"{input.Title}:{input.RenamedField}",
                TotalCount = input.Count + input.Tags.Count,
                MergedConfigs = new Dictionary<string, string>(input.Configs)
                {
                    ["Active"] = input.IsActive.ToString()
                }
            });
        }
    }

    [Fact]
    public void ToolModelBinder_ShouldBindPrimitivesAndCaseInsensitiveProperties()
    {
        var rawInputs = new Dictionary<string, object?>
        {
            ["title"] = "Helmet Asset",
            ["COUNT"] = "42",
            ["factor"] = 3.1415,
            ["is_active"] = "true",
            ["item_id"] = "e2d5cb35-b883-4a11-b0db-6e06b9868e4a",
            ["CustomAlias"] = "CustomValue"
        };

        var bound = ToolModelBinder.Bind<SampleInputs>(rawInputs);

        bound.Title.Should().Be("Helmet Asset");
        bound.Count.Should().Be(42);
        bound.Factor.Should().BeApproximately(3.1415, 0.0001);
        bound.IsActive.Should().BeTrue();
        bound.ItemId.Should().Be(Guid.Parse("e2d5cb35-b883-4a11-b0db-6e06b9868e4a"));
        bound.RenamedField.Should().Be("CustomValue");
        bound.IgnoredField.Should().Be("Ignored");
    }

    [Fact]
    public void ToolModelBinder_ShouldBindCollectionsAndJsonElements()
    {
        using var jsonDoc = JsonDocument.Parse("""
        {
            "tags": ["armor", "helmet", "sci-fi"],
            "configs": { "lod": "0", "quality": "ultra" }
        }
        """);

        var rawInputs = new Dictionary<string, object?>
        {
            ["tags"] = jsonDoc.RootElement.GetProperty("tags"),
            ["configs"] = jsonDoc.RootElement.GetProperty("configs")
        };

        var bound = ToolModelBinder.Bind<SampleInputs>(rawInputs);

        bound.Tags.Should().BeEquivalentTo(new[] { "armor", "helmet", "sci-fi" });
        bound.Configs.Should().ContainKey("lod").WhoseValue.Should().Be("0");
        bound.Configs.Should().ContainKey("quality").WhoseValue.Should().Be("ultra");
    }

    [Fact]
    public void ToolModelBinder_ShouldInferPinDefinitionsCorrectly()
    {
        var tool = new SampleTool();

        var inputs = tool.Inputs;
        var outputs = tool.Outputs;

        inputs.Should().Contain(p => p.Id == "Title" && p.PrimitiveType == PinPrimitiveType.String && p.Cardinality == PinCardinality.Single);
        inputs.Should().Contain(p => p.Id == "Count" && p.PrimitiveType == PinPrimitiveType.Number);
        inputs.Should().Contain(p => p.Id == "IsActive" && p.PrimitiveType == PinPrimitiveType.Boolean);
        inputs.Should().Contain(p => p.Id == "ItemId" && p.PrimitiveType == PinPrimitiveType.EntityRef);
        inputs.Should().Contain(p => p.Id == "Tags" && p.PrimitiveType == PinPrimitiveType.String && p.Cardinality == PinCardinality.Array);
        inputs.Should().Contain(p => p.Id == "Configs" && p.PrimitiveType == PinPrimitiveType.String && p.Cardinality == PinCardinality.Map);
        inputs.Should().Contain(p => p.Id == "CustomAlias");
        inputs.Should().NotContain(p => p.Id == "IgnoredField");

        outputs.Should().Contain(p => p.Id == "FullMessage");
        outputs.Should().Contain(p => p.Id == "TotalCount");
        outputs.Should().Contain(p => p.Id == "MergedConfigs" && p.Cardinality == PinCardinality.Map);
    }

    [Fact]
    public async Task BaseResolverTool_ShouldExecuteEndToEnd()
    {
        var tool = new SampleTool();
        var rawInputs = new Dictionary<string, object>
        {
            ["title"] = "Hero",
            ["CustomAlias"] = "Warrior",
            ["count"] = 10,
            ["tags"] = new List<string> { "tag1", "tag2" },
            ["isactive"] = true,
            ["configs"] = new Dictionary<string, string> { ["Role"] = "DPS" }
        };

        var result = await tool.ExecuteAsync(rawInputs, _context);

        result["FullMessage"].Should().Be("Hero:Warrior");
        result["TotalCount"].Should().Be(12);
        var merged = result["MergedConfigs"] as Dictionary<string, string>;
        merged.Should().NotBeNull();
        merged!["Role"].Should().Be("DPS");
        merged["Active"].Should().Be("True");
    }
}
