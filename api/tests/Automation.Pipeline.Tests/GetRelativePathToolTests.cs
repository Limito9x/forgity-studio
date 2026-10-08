using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Tools;
using Automation.Pipeline.Tools.Utility;
using Xunit;

namespace Automation.Pipeline.Tests;

public class GetRelativePathToolTests
{
    private readonly GetRelativePathTool _tool = new();

    [Fact]
    public async Task Should_Compute_Single_Relative_Path_Correctly()
    {
        var inputs = new Dictionary<string, object>
        {
            ["RootPath"] = @"C:\DazLibrary\MyAssets",
            ["FullPath"] = @"C:\DazLibrary\MyAssets\Characters\Genesis8\Female.duf"
        };

        var ctx = new ToolExecutionContext(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);
        var result = await _tool.ExecuteAsync(inputs, ctx);

        Assert.NotNull(result);
        Assert.Equal("Characters/Genesis8/Female.duf", result["RelativePath"]);
        
        var array = result["RelativePaths"] as string[];
        Assert.NotNull(array);
        Assert.Single(array);
        Assert.Equal("Characters/Genesis8/Female.duf", array[0]);
    }

    [Fact]
    public async Task Should_Compute_Array_Of_FullPaths_Correctly()
    {
        var inputs = new Dictionary<string, object>
        {
            ["RootPath"] = @"D:/Repositories/ProjectA/",
            ["FullPaths"] = new List<string>
            {
                @"D:\Repositories\ProjectA\Scenes\Main.blend",
                @"D:/Repositories/ProjectA/Textures/Skin_BaseColor.png",
                @"D:/Repositories/ProjectA/Textures/Skin_Normal.png"
            }
        };

        var ctx = new ToolExecutionContext(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);
        var result = await _tool.ExecuteAsync(inputs, ctx);

        Assert.NotNull(result);
        Assert.Equal("Scenes/Main.blend", result["RelativePath"]);

        var array = result["RelativePaths"] as string[];
        Assert.NotNull(array);
        Assert.Equal(3, array.Length);
        Assert.Equal("Scenes/Main.blend", array[0]);
        Assert.Equal("Textures/Skin_BaseColor.png", array[1]);
        Assert.Equal("Textures/Skin_Normal.png", array[2]);
    }

    [Fact]
    public void Should_Have_Pure_And_Key_Definition()
    {
        Assert.True(_tool.IsPure);
        Assert.Equal("GetRelativePath", _tool.Key);
        Assert.Contains("MakeRelativePath", _tool.Aliases);
        Assert.Contains("ComputeRelativePath", _tool.Aliases);

        Assert.Contains(_tool.Inputs, p => p.Id == "RootPath" && p.IsRequired);
        Assert.Contains(_tool.Inputs, p => p.Id == "FullPath");
        Assert.Contains(_tool.Inputs, p => p.Id == "FullPaths" && p.Cardinality == PinCardinality.Array);
        Assert.Contains(_tool.Outputs, p => p.Id == "RelativePath");
        Assert.Contains(_tool.Outputs, p => p.Id == "RelativePaths" && p.Cardinality == PinCardinality.Array);
    }
}
