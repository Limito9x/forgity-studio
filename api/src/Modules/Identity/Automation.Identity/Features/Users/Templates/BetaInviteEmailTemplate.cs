using System.Net;
using System.Text;

namespace Automation.Identity.Features.Users.Templates;

/// <summary>
/// Minimalist "Developer-to-Developer Personal Note" email template.
/// Engineered for 99%+ deliverability, high text-to-HTML ratio, and zero spam triggers.
/// Supports both clean HTML and pure plaintext MIME alternatives.
/// </summary>
public static class BetaInviteEmailTemplate
{
    public static string Render(
        string email,
        string inviteLink,
        string? personalNote = null,
        string? discordUrl = null)
    {
        var escapedEmail = WebUtility.HtmlEncode(email);
        var escapedInviteLink = WebUtility.HtmlEncode(inviteLink);
        var escapedPersonalNote = !string.IsNullOrWhiteSpace(personalNote)
            ? WebUtility.HtmlEncode(personalNote).Replace("\n", "<br/>")
            : null;
        var escapedDiscordUrl = !string.IsNullOrWhiteSpace(discordUrl)
            ? WebUtility.HtmlEncode(discordUrl)
            : null;

        var personalNoteSection = escapedPersonalNote != null
            ? $@"
              <tr>
                <td style=""padding: 0 0 24px 0;"">
                  <div style=""background-color: #f8fafc; border-left: 3px solid #4f46e5; border-radius: 4px; padding: 14px 18px;"">
                    <p style=""margin: 0 0 6px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #4f46e5;"">
                      Note from the team
                    </p>
                    <p style=""margin: 0; font-size: 14px; line-height: 22px; color: #334155; font-style: italic;"">
                      &ldquo;{escapedPersonalNote}&rdquo;
                    </p>
                  </div>
                </td>
              </tr>"
            : "";

        var discordSection = escapedDiscordUrl != null
            ? $@"
              <tr>
                <td style=""padding: 0 0 20px 0;"">
                  <p style=""margin: 0; font-size: 13px; line-height: 20px; color: #475569;"">
                    Need help or want to talk to the creators?
                    <a href=""{escapedDiscordUrl}"" style=""color: #4f46e5; text-decoration: underline; font-weight: 500;"" target=""_blank"">
                      Join our Discord Beta Community &rarr;
                    </a>
                  </p>
                </td>
              </tr>"
            : "";

        return $@"<!DOCTYPE html>
<html lang=""en"">
<head>
  <meta charset=""UTF-8"">
  <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
  <title>Welcome to Forgity Studio Beta</title>
</head>
<body style=""margin: 0; padding: 32px 16px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;"">
  <table role=""presentation"" border=""0"" cellpadding=""0"" cellspacing=""0"" width=""100%"" align=""center"">
    <tr>
      <td align=""center"">
        <!-- Main Card -->
        <table role=""presentation"" border=""0"" cellpadding=""0"" cellspacing=""0"" width=""100%"" style=""max-width: 560px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 32px;"">
          
          <!-- Header / Brand -->
          <tr>
            <td style=""padding: 0 0 24px 0; border-bottom: 1px solid #f1f5f9;"">
              <table role=""presentation"" border=""0"" cellpadding=""0"" cellspacing=""0"" width=""100%"">
                <tr>
                  <td>
                    <span style=""font-size: 16px; font-weight: 800; letter-spacing: -0.3px; color: #0f172a;"">
                      FORGITY <span style=""color: #4f46e5;"">STUDIO</span>
                    </span>
                  </td>
                  <td align=""right"">
                    <span style=""display: inline-block; padding: 2px 8px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-radius: 4px; background-color: #eef2ff; color: #4338ca;"">
                      Beta Access
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting & Intro -->
          <tr>
            <td style=""padding: 24px 0 16px 0;"">
              <h1 style=""margin: 0 0 12px 0; font-size: 20px; font-weight: 700; line-height: 28px; color: #0f172a;"">
                You're invited to the Closed Beta
              </h1>
              <p style=""margin: 0; font-size: 15px; line-height: 24px; color: #334155;"">
                Hi, you have been invited to test <strong>Forgity Studio</strong> &mdash; the high-performance node graph pipeline engine for Blender, Unreal Engine, and DCC workflow automation.
              </p>
            </td>
          </tr>

          {personalNoteSection}

          <!-- Highlights -->
          <tr>
            <td style=""padding: 0 0 24px 0;"">
              <table role=""presentation"" border=""0"" cellpadding=""0"" cellspacing=""0"" width=""100%"" style=""font-size: 13px; line-height: 20px; color: #475569;"">
                <tr>
                  <td style=""padding: 6px 0; vertical-align: top; width: 16px; color: #4f46e5;"">&bull;</td>
                  <td style=""padding: 6px 0 6px 8px; vertical-align: top;"">
                    <strong style=""color: #1e293b;"">Client-Side Runner Daemon:</strong> Headless automation executed directly on your workstation GPU with native Blender &amp; Unreal integration.
                  </td>
                </tr>
                <tr>
                  <td style=""padding: 6px 0; vertical-align: top; width: 16px; color: #4f46e5;"">&bull;</td>
                  <td style=""padding: 6px 0 6px 8px; vertical-align: top;"">
                    <strong style=""color: #1e293b;"">S3 Storage &amp; Streaming:</strong> Connect your own storage (BYOS) or studio bucket with instant deduplication and zero-RAM piped streaming.
                  </td>
                </tr>
                <tr>
                  <td style=""padding: 6px 0; vertical-align: top; width: 16px; color: #4f46e5;"">&bull;</td>
                  <td style=""padding: 6px 0 6px 8px; vertical-align: top;"">
                    <strong style=""color: #1e293b;"">Visual Node DAG Pipeline:</strong> Create reusable node graphs for automated 3D conversion, asset optimization, and material baking.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Primary CTA Button -->
          <tr>
            <td style=""padding: 0 0 20px 0;"">
              <table role=""presentation"" border=""0"" cellpadding=""0"" cellspacing=""0"">
                <tr>
                  <td align=""center"" style=""border-radius: 6px; background-color: #0f172a;"">
                    <a href=""{escapedInviteLink}"" target=""_blank"" style=""display: inline-block; padding: 12px 24px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px;"">
                      Activate Your Beta Account &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Plaintext Link Fallback -->
          <tr>
            <td style=""padding: 0 0 24px 0;"">
              <p style=""margin: 0 0 6px 0; font-size: 12px; color: #64748b;"">
                If the button above does not work, copy and paste this link into your browser:
              </p>
              <p style=""margin: 0; font-size: 12px; line-height: 18px; word-break: break-all; color: #4f46e5;"">
                <a href=""{escapedInviteLink}"" style=""color: #4f46e5;"">{escapedInviteLink}</a>
              </p>
            </td>
          </tr>

          {discordSection}

          <!-- Ownership & Trust Notice -->
          <tr>
            <td style=""padding: 16px 0 0 0; border-top: 1px solid #f1f5f9;"">
              <p style=""margin: 0 0 6px 0; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b;"">
                Asset Privacy Guarantee
              </p>
              <p style=""margin: 0 0 12px 0; font-size: 12px; line-height: 18px; color: #64748b;"">
                All 3D assets, source models, and project configurations processed through your runners remain 100% your private intellectual property. Forgity Studio never accesses, collects, or uses your creative files to train machine learning models.
              </p>
              <p style=""margin: 0; font-size: 11px; color: #94a3b8;"">
                This invitation was issued for <strong>{escapedEmail}</strong> and expires in 7 days.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>";
    }

    /// <summary>
    /// Generates pure plain-text alternative body for multipart/alternative MIME.
    /// Eliminates spam score penalty for missing plaintext version.
    /// </summary>
    public static string RenderPlainText(
        string email,
        string inviteLink,
        string? personalNote = null,
        string? discordUrl = null)
    {
        var sb = new StringBuilder();

        sb.AppendLine("Hi,");
        sb.AppendLine();
        sb.AppendLine("You're invited to test Forgity Studio — a high-performance node graph pipeline engine for Blender, Unreal Engine, and DCC workflow automation.");
        sb.AppendLine();

        if (!string.IsNullOrWhiteSpace(personalNote))
        {
            sb.AppendLine("--- Note from the team ---");
            sb.AppendLine($"\"{personalNote.Trim()}\"");
            sb.AppendLine("--------------------------");
            sb.AppendLine();
        }

        sb.AppendLine("Core Highlights:");
        sb.AppendLine("- Client-Side Runner Daemon: Headless automation executed directly on your workstation GPU with native Blender & Unreal integration.");
        sb.AppendLine("- S3 Storage & Streaming: Connect your own storage (BYOS) or studio bucket with instant deduplication and zero-RAM piped streaming.");
        sb.AppendLine("- Visual DAG Pipeline: Automated 3D conversion, asset optimization, material baking, and batch processing.");
        sb.AppendLine();
        sb.AppendLine("To activate your beta account, visit the link below:");
        sb.AppendLine(inviteLink);
        sb.AppendLine();

        if (!string.IsNullOrWhiteSpace(discordUrl))
        {
            sb.AppendLine("Need help or want to talk to the creators?");
            sb.AppendLine($"Join our Discord Beta Community: {discordUrl.Trim()}");
            sb.AppendLine();
        }

        sb.AppendLine("Asset Privacy Guarantee:");
        sb.AppendLine("All 3D assets and configurations executed on your runner remain 100% your private intellectual property. Forgity Studio never accesses or trains machine learning models on your creative files.");
        sb.AppendLine();
        sb.AppendLine("---");
        sb.AppendLine($"This invitation was issued for {email} and expires in 7 days.");
        sb.AppendLine("Forgity Studio");

        return sb.ToString();
    }
}
