using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Contracts.Tools.Attributes;

namespace Automation.Pipeline.Contracts.Tools.Utility;

public class SplitStringInputs
{
    [ToolPin(Id = "Source", Label = "Source Text", PrimitiveType = PinPrimitiveType.String, IsRequired = true, Description = "The text to be split into tokens (e.g. BaseName from Break Struct).")]
    public string Source { get; set; } = string.Empty;

    [ToolPin(Id = "Delimiter", Label = "Delimiter", PrimitiveType = PinPrimitiveType.String, IsRequired = false, DefaultValue = "_", Description = "Separator string or character (e.g. '_', '/', '-'). Defaults to '_'.")]
    public string Delimiter { get; set; } = "_";

    [ToolPin(Id = "Index", Label = "Index", PrimitiveType = PinPrimitiveType.Number, IsRequired = false, DefaultValue = 0, Description = "Zero-based index of the token to retrieve. Negative index (-1, -2) counts from the end.")]
    public int Index { get; set; } = 0;

    [ToolPin(Id = "TrimTokens", Label = "Trim Tokens", PrimitiveType = PinPrimitiveType.Boolean, IsRequired = false, DefaultValue = true, Description = "Whether to trim leading and trailing whitespace from each token.")]
    public bool TrimTokens { get; set; } = true;

    [ToolPin(Id = "RemoveEmpty", Label = "Remove Empty", PrimitiveType = PinPrimitiveType.Boolean, IsRequired = false, DefaultValue = true, Description = "Whether to filter out consecutive empty delimiter tokens.")]
    public bool RemoveEmpty { get; set; } = true;
}

public class SplitStringOutputs
{
    [ToolPin(Id = "Result", Label = "Result", PrimitiveType = PinPrimitiveType.String, Description = "Token at the specified Index. Empty if out of range.")]
    public string Result { get; set; } = string.Empty;

    [ToolPin(Id = "First", Label = "First", PrimitiveType = PinPrimitiveType.String, Description = "First token in the split result.")]
    public string First { get; set; } = string.Empty;

    [ToolPin(Id = "Last", Label = "Last", PrimitiveType = PinPrimitiveType.String, Description = "Last token in the split result.")]
    public string Last { get; set; } = string.Empty;

    [ToolPin(Id = "Items", Label = "Items", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Array, Description = "All extracted tokens as a string array.")]
    public List<string> Items { get; set; } = [];

    [ToolPin(Id = "Count", Label = "Count", PrimitiveType = PinPrimitiveType.Number, Description = "Total number of extracted tokens.")]
    public int Count { get; set; } = 0;
}

/// <summary>
/// Tool phân rã chuỗi ký tự theo ký tự phân cách (Split String / Parse Into Array).
/// Hỗ trợ lấy phần tử theo Index (kèm negative index), First, Last và mảng Items.
/// </summary>
public class SplitStringTool : BaseResolverTool<SplitStringInputs, SplitStringOutputs>
{
    public override string Key => "SplitString";
    public override string Label => "Split String";
    public override string? Category => "Utility";
    public override string? Description => "Splits a string into multiple tokens by a delimiter (e.g. '_', '/', '.') and outputs indexed elements or array.";
    public override bool IsPure => true;
    public override IReadOnlyList<string> Aliases => ["Split", "ParseIntoArray", "Tokenize"];

    protected override Task<SplitStringOutputs> ExecuteCoreAsync(SplitStringInputs input, ToolExecutionContext context)
    {
        var source = input.Source ?? string.Empty;
        var delimiter = string.IsNullOrEmpty(input.Delimiter) ? "_" : input.Delimiter;
        var splitOptions = input.RemoveEmpty ? StringSplitOptions.RemoveEmptyEntries : StringSplitOptions.None;

        var tokens = source
            .Split(delimiter, splitOptions)
            .Select(t => input.TrimTokens ? t.Trim() : t)
            .ToList();

        var first = tokens.FirstOrDefault() ?? string.Empty;
        var last = tokens.LastOrDefault() ?? string.Empty;

        // Support negative indexing: -1 means last, -2 means second to last
        var targetIndex = input.Index;
        if (targetIndex < 0)
        {
            targetIndex = tokens.Count + targetIndex;
        }

        var result = (targetIndex >= 0 && targetIndex < tokens.Count)
            ? tokens[targetIndex]
            : string.Empty;

        return Task.FromResult(new SplitStringOutputs
        {
            Result = result,
            First = first,
            Last = last,
            Items = tokens,
            Count = tokens.Count
        });
    }
}

