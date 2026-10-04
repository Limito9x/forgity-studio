using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Tools.Attributes;

namespace Automation.Pipeline.Tools.Utility;

public class GetRelativePathInputs
{
    [ToolPin(Id = "RootPath", Label = "Root Path", PrimitiveType = PinPrimitiveType.Path, IsRequired = true)]
    public string RootPath { get; set; } = string.Empty;

    [ToolPin(Id = "FullPath", Label = "Full Path", PrimitiveType = PinPrimitiveType.Path, IsRequired = false, DefaultValue = "")]
    public string FullPath { get; set; } = string.Empty;

    [ToolPin(Id = "FullPaths", Label = "Full Paths", PrimitiveType = PinPrimitiveType.Path, Cardinality = PinCardinality.Array, IsRequired = false)]
    public List<string> FullPaths { get; set; } = [];
}

public class GetRelativePathOutputs
{
    [ToolPin(Id = "RelativePath", Label = "Relative Path", PrimitiveType = PinPrimitiveType.Path, IsRequired = false)]
    public string RelativePath { get; set; } = string.Empty;

    [ToolPin(Id = "RelativePaths", Label = "Relative Paths", PrimitiveType = PinPrimitiveType.Path, Cardinality = PinCardinality.Array, IsRequired = false)]
    public string[] RelativePaths { get; set; } = [];
}

/// <summary>
/// Tool chuyển đổi đường dẫn tuyệt đối (Full Path) thành đường dẫn tương đối (Relative Path) dựa trên Root Path.
/// Hỗ trợ cả xử lý đường dẫn đơn lẻ và mảng đường dẫn hàng loạt.
/// </summary>
public class GetRelativePathTool : BaseResolverTool<GetRelativePathInputs, GetRelativePathOutputs>
{
    public override string Key => "GetRelativePath";
    public override IReadOnlyList<string> Aliases => ["MakeRelativePath", "ComputeRelativePath"];
    public override string Label => "Get Relative Path";
    public override string? Category => "Utility";
    public override bool IsPure => true;

    protected override Task<GetRelativePathOutputs> ExecuteCoreAsync(GetRelativePathInputs input, ToolExecutionContext context)
    {
        var root = (input.RootPath ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(root))
        {
            throw new ArgumentException("RootPath is required to compute relative path.");
        }

        var results = new List<string>();

        // 1. Xử lý FullPath đơn lẻ
        var singleRel = string.Empty;
        if (!string.IsNullOrWhiteSpace(input.FullPath))
        {
            singleRel = ComputeRelative(root, input.FullPath);
            results.Add(singleRel);
        }

        // 2. Xử lý danh sách FullPaths nếu có
        if (input.FullPaths != null && input.FullPaths.Count > 0)
        {
            foreach (var p in input.FullPaths)
            {
                if (string.IsNullOrWhiteSpace(p)) continue;
                var rel = ComputeRelative(root, p);
                if (!results.Contains(rel, StringComparer.OrdinalIgnoreCase))
                {
                    results.Add(rel);
                }
            }
        }

        if (string.IsNullOrEmpty(singleRel) && results.Count > 0)
        {
            singleRel = results[0];
        }

        return Task.FromResult(new GetRelativePathOutputs
        {
            RelativePath = singleRel,
            RelativePaths = results.ToArray()
        });
    }

    private static string ComputeRelative(string root, string full)
    {
        var cleanFull = full.Trim();
        if (string.IsNullOrWhiteSpace(cleanFull))
            return string.Empty;

        try
        {
            var rel = Path.GetRelativePath(root, cleanFull).Replace('\\', '/');
            if (rel.StartsWith("./"))
            {
                rel = rel[2..];
            }
            return rel.TrimStart('/');
        }
        catch
        {
            // Fallback nếu khác ổ đĩa trên Windows (ví dụ C: vs D:)
            return cleanFull.Replace('\\', '/');
        }
    }
}
