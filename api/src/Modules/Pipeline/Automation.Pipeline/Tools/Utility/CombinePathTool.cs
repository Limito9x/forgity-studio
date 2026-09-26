using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Tools.Attributes;

namespace Automation.Pipeline.Tools.Utility;

public class CombinePathInputs
{
    [ToolPin(Id = "BasePath", Label = "Base Path", PrimitiveType = PinPrimitiveType.Path, IsRequired = true)]
    public string BasePath { get; set; } = string.Empty;

    [ToolPin(Id = "SubFolder", Label = "Sub Folder", PrimitiveType = PinPrimitiveType.String, IsRequired = false, DefaultValue = "")]
    public string SubFolder { get; set; } = string.Empty;

    [ToolPin(Id = "FileName", Label = "File Name", PrimitiveType = PinPrimitiveType.String, IsRequired = false, DefaultValue = "")]
    public string FileName { get; set; } = string.Empty;

    [ToolPin(Id = "Extension", Label = "Extension", PrimitiveType = PinPrimitiveType.String, IsRequired = false, DefaultValue = "")]
    public string Extension { get; set; } = string.Empty;
}

public class CombinePathOutputs
{
    [ToolPin(Id = "FullPath", Label = "Full Path", PrimitiveType = PinPrimitiveType.Path, IsRequired = true)]
    public string FullPath { get; set; } = string.Empty;
}

public class CombinePathTool : BaseResolverTool<CombinePathInputs, CombinePathOutputs>
{
    public override string Key => "CombinePath";
    public override string Label => "Combine Path";
    public override string? Category => "Utility";
    public override bool IsPure => true;

    protected override Task<CombinePathOutputs> ExecuteCoreAsync(CombinePathInputs input, ToolExecutionContext context)
    {
        var fullFileName = input.FileName;
        if (!string.IsNullOrEmpty(input.Extension))
        {
            var ext = input.Extension.StartsWith(".") ? input.Extension : "." + input.Extension;
            if (!fullFileName.EndsWith(ext, StringComparison.OrdinalIgnoreCase))
            {
                fullFileName += ext;
            }
        }

        var combined = input.BasePath;
        if (!string.IsNullOrEmpty(input.SubFolder))
        {
            combined = Path.Combine(combined, input.SubFolder);
        }
        if (!string.IsNullOrEmpty(fullFileName))
        {
            combined = Path.Combine(combined, fullFileName);
        }

        return Task.FromResult(new CombinePathOutputs
        {
            FullPath = combined.Replace('\\', '/')
        });
    }
}
