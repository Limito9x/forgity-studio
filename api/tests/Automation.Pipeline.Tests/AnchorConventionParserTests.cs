using Automation.Content.Contracts;
using Xunit;

namespace Automation.Pipeline.Tests;

public class AnchorConventionParserTests
{
    [Theory]
    [InlineData("Eva.duf", "Eva", "root/Eva.duf")]
    [InlineData("Eva.blend", "Eva", "root/Eva.blend")]
    [InlineData("Characters/Eva/Eva.blend", "Eva", "root/Eva.blend")]
    public void Parse_SingleToken_ShouldReturnRootAnchor(string path, string expectedContent, string expectedAnchor)
    {
        var result = AnchorConventionParser.Parse(path);
        Assert.Equal(expectedContent, result.ContentName);
        Assert.Equal(expectedAnchor, result.AnchorPath);
    }

    [Theory]
    [InlineData("Eva_Outfit1.blend", "Eva", "Outfit1/Eva_Outfit1.blend")]
    [InlineData("Characters/Eva/outfits/Eva_Outfit1.duf", "Eva", "Outfit1/Eva_Outfit1.duf")]
    public void Parse_TwoTokens_ShouldReturnAnchorWithFileName(string path, string expectedContent, string expectedAnchor)
    {
        var result = AnchorConventionParser.Parse(path);
        Assert.Equal(expectedContent, result.ContentName);
        Assert.Equal(expectedAnchor, result.AnchorPath);
    }

    [Theory]
    [InlineData("Eva_Outfit1_BrzUsBra.fbx", "Eva", "Outfit1/BrzUsBra")]
    [InlineData("Eva_Outfit1_BrzUsPanties.fbx", "Eva", "Outfit1/BrzUsPanties")]
    [InlineData("Eva_Outfit1_IridessaHair.fbx", "Eva", "Outfit1/IridessaHair")]
    public void Parse_ThreeTokens_ShouldReturnAnchorAndLeaf(string path, string expectedContent, string expectedAnchor)
    {
        var result = AnchorConventionParser.Parse(path);
        Assert.Equal(expectedContent, result.ContentName);
        Assert.Equal(expectedAnchor, result.AnchorPath);
    }

    [Theory]
    [InlineData("Eva_Outfits_Summer_SilkDress.fbx", "Eva", "Outfits/Summer/SilkDress")]
    [InlineData("Eva_Combat_Weapons_Melee_Sword.fbx", "Eva", "Combat/Weapons/Melee/Sword")]
    public void Parse_DeepTokens_ShouldPreserveVirtualPathHierarchy(string path, string expectedContent, string expectedAnchor)
    {
        var result = AnchorConventionParser.Parse(path);
        Assert.Equal(expectedContent, result.ContentName);
        Assert.Equal(expectedAnchor, result.AnchorPath);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void Parse_EmptyOrNull_ShouldHandleGracefully(string? path)
    {
        var result = AnchorConventionParser.Parse(path!);
        Assert.Equal(string.Empty, result.ContentName);
        Assert.Equal("root", result.AnchorPath);
    }
}

