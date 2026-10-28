using Automation.Identity.Features.Users.Templates;
using Xunit;

namespace Automation.Identity.Tests;

public class BetaInviteEmailTemplateTests
{
    [Fact]
    public void Render_WithAllFields_GeneratesValidHtmlWithEscaping()
    {
        // Arrange
        var email = "tester<script>@example.com";
        var inviteLink = "https://example.com/accept?token=abc&email=tester%40example.com";
        var note = "Excited to have you on board! <alert>";
        var discord = "https://discord.gg/forgity";

        // Act
        var html = BetaInviteEmailTemplate.Render(email, inviteLink, note, discord);

        // Assert
        Assert.NotNull(html);
        Assert.Contains("<!DOCTYPE html>", html);
        Assert.Contains("FORGITY", html);
        Assert.Contains("STUDIO", html);
        Assert.Contains("tester&lt;script&gt;@example.com", html);
        Assert.Contains("Excited to have you on board! &lt;alert&gt;", html);
        Assert.Contains("https://discord.gg/forgity", html);
        Assert.Contains("Asset Privacy Guarantee", html);
        Assert.DoesNotContain("<script>", html);
    }

    [Fact]
    public void Render_WithoutOptionalFields_OmitsSectionsCleanly()
    {
        // Arrange
        var email = "minimal@example.com";
        var inviteLink = "https://example.com/accept";

        // Act
        var html = BetaInviteEmailTemplate.Render(email, inviteLink);

        // Assert
        Assert.NotNull(html);
        Assert.Contains("minimal@example.com", html);
        Assert.Contains(inviteLink, html);
        Assert.DoesNotContain("Note from the team", html);
        Assert.DoesNotContain("Join our Discord Beta Community", html);
    }

    [Fact]
    public void RenderPlainText_WithAllFields_GeneratesCleanMimeAlternative()
    {
        // Arrange
        var email = "tester@example.com";
        var inviteLink = "https://example.com/accept?token=123";
        var note = "Welcome to the closed beta!";
        var discord = "https://discord.gg/forgity";

        // Act
        var plain = BetaInviteEmailTemplate.RenderPlainText(email, inviteLink, note, discord);

        // Assert
        Assert.NotNull(plain);
        Assert.DoesNotContain("<html", plain);
        Assert.DoesNotContain("<table>", plain);
        Assert.DoesNotContain("<div", plain);
        Assert.Contains("Hi,", plain);
        Assert.Contains("You're invited to test Forgity Studio", plain);
        Assert.Contains("Welcome to the closed beta!", plain);
        Assert.Contains("https://example.com/accept?token=123", plain);
        Assert.Contains("https://discord.gg/forgity", plain);
        Assert.Contains("Asset Privacy Guarantee:", plain);
        Assert.Contains("tester@example.com", plain);
    }

    [Fact]
    public void RenderPlainText_WithoutOptionalFields_OmitsSectionsCleanly()
    {
        // Arrange
        var email = "minimal@example.com";
        var inviteLink = "https://example.com/accept";

        // Act
        var plain = BetaInviteEmailTemplate.RenderPlainText(email, inviteLink);

        // Assert
        Assert.NotNull(plain);
        Assert.DoesNotContain("Note from the team", plain);
        Assert.DoesNotContain("Discord Beta Community", plain);
        Assert.Contains(inviteLink, plain);
        Assert.Contains(email, plain);
    }
}

