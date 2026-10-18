using System.Net;

namespace Automation.Identity.Features.Users.Templates;

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
              <!-- Personal Note -->
              <tr>
                <td style=""padding: 0 32px 24px 32px;"">
                  <table role=""presentation"" border=""0"" cellpadding=""0"" cellspacing=""0"" width=""100%"" style=""background-color: #0f172a; border-left: 3px solid #6366f1; border-radius: 6px;"">
                    <tr>
                      <td style=""padding: 16px 20px;"">
                        <p style=""margin: 0 0 6px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #818cf8;"">
                          A Note from the Founder
                        </p>
                        <p style=""margin: 0; font-size: 14px; line-height: 22px; color: #cbd5e1; font-style: italic;"">
                          &ldquo;{escapedPersonalNote}&rdquo;
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>"
            : "";

        var discordSection = escapedDiscordUrl != null
            ? $@"
              <!-- Discord Link -->
              <tr>
                <td align=""center"" style=""padding: 0 32px 24px 32px;"">
                  <p style=""margin: 0; font-size: 13px; color: #94a3b8;"">
                    Need help or want to talk to the creators?
                    <a href=""{escapedDiscordUrl}"" style=""color: #818cf8; text-decoration: underline; font-weight: 500;"" target=""_blank"">
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
<body style=""margin: 0; padding: 0; background-color: #090d16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9; -webkit-font-smoothing: antialiased;"">
  <table role=""presentation"" border=""0"" cellpadding=""0"" cellspacing=""0"" width=""100%"" style=""background-color: #090d16; padding: 40px 16px;"">
    <tr>
      <td align=""center"">
        <!-- Main Container Card -->
        <table role=""presentation"" border=""0"" cellpadding=""0"" cellspacing=""0"" width=""100%"" style=""max-width: 580px; background-color: #131b2e; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);"">
          
          <!-- Top Accent Bar -->
          <tr>
            <td style=""height: 4px; background: linear-gradient(90deg, #6366f1, #3b82f6, #06b6d4);""></td>
          </tr>

          <!-- Header / Brand -->
          <tr>
            <td style=""padding: 32px 32px 16px 32px;"">
              <table role=""presentation"" border=""0"" cellpadding=""0"" cellspacing=""0"" width=""100%"">
                <tr>
                  <td>
                    <span style=""font-size: 18px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff;"">
                      FORGITY <span style=""color: #818cf8;"">STUDIO</span>
                    </span>
                  </td>
                  <td align=""right"">
                    <span style=""display: inline-block; padding: 4px 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; border-radius: 9999px; background-color: rgba(99, 102, 241, 0.15); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.3);"">
                      Cohort 1 Beta
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero Headline -->
          <tr>
            <td style=""padding: 16px 32px 20px 32px;"">
              <h1 style=""margin: 0 0 12px 0; font-size: 24px; font-weight: 700; line-height: 32px; color: #ffffff;"">
                You're invited to the Closed Beta
              </h1>
              <p style=""margin: 0; font-size: 15px; line-height: 24px; color: #94a3b8;"">
                Hi there! You have been granted exclusive early access to <strong style=""color: #f1f5f9;"">Forgity Studio</strong> &mdash; the high-performance 3D automation and node graph pipeline engine for Blender and Unreal Engine.
              </p>
            </td>
          </tr>

          {personalNoteSection}

          <!-- Highlights Grid / Feature List -->
          <tr>
            <td style=""padding: 0 32px 28px 32px;"">
              <table role=""presentation"" border=""0"" cellpadding=""0"" cellspacing=""0"" width=""100%"" style=""background-color: #0b1120; border: 1px solid #1e293b; border-radius: 8px; padding: 16px;"">
                <tr>
                  <td style=""padding: 8px 12px; vertical-align: top; width: 24px; color: #818cf8; font-size: 16px;"">
                    &#9889;
                  </td>
                  <td style=""padding: 8px 12px 8px 0; vertical-align: top;"">
                    <strong style=""color: #f8fafc; font-size: 13px; display: block; margin-bottom: 2px;"">Client-Side Runner Daemon</strong>
                    <span style=""color: #94a3b8; font-size: 12px; line-height: 18px; display: block;"">
                      Execute headless automation jobs directly on your local workstation GPU with native Blender &amp; Unreal Engine integration.
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style=""padding: 8px 12px; vertical-align: top; width: 24px; color: #38bdf8; font-size: 16px;"">
                    &#128230;
                  </td>
                  <td style=""padding: 8px 12px 8px 0; vertical-align: top;"">
                    <strong style=""color: #f8fafc; font-size: 13px; display: block; margin-bottom: 2px;"">Zero-Byte S3 Storage &amp; Streaming</strong>
                    <span style=""color: #94a3b8; font-size: 12px; line-height: 18px; display: block;"">
                      Connect your own S3/MinIO bucket (BYOS) or use studio storage with instant deduplication and high-speed streaming.
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style=""padding: 8px 12px; vertical-align: top; width: 24px; color: #34d399; font-size: 16px;"">
                    &#128396;
                  </td>
                  <td style=""padding: 8px 12px 8px 0; vertical-align: top;"">
                    <strong style=""color: #f8fafc; font-size: 13px; display: block; margin-bottom: 2px;"">Visual Node DAG Pipeline</strong>
                    <span style=""color: #94a3b8; font-size: 12px; line-height: 18px; display: block;"">
                      Design reusable node graphs for automated 3D conversion, asset optimization, material baking, and batch cataloging.
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Primary CTA Button -->
          <tr>
            <td align=""center"" style=""padding: 0 32px 32px 32px;"">
              <table role=""presentation"" border=""0"" cellpadding=""0"" cellspacing=""0"">
                <tr>
                  <td align=""center"" style=""border-radius: 8px; background-color: #4f46e5;"">
                    <a href=""{escapedInviteLink}"" target=""_blank"" style=""display: inline-block; padding: 14px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);"">
                      Activate Your Beta Account &rarr;
                    </a>
                  </td>
                </tr>
              </table>
              <p style=""margin: 16px 0 0 0; font-size: 12px; color: #64748b;"">
                This link was issued for <strong style=""color: #94a3b8;"">{escapedEmail}</strong> and expires in 7 days.
              </p>
            </td>
          </tr>

          {discordSection}

          <!-- Ownership & Trust Notice -->
          <tr>
            <td style=""padding: 20px 32px; background-color: #0b1120; border-top: 1px solid #1e293b;"">
              <p style=""margin: 0 0 6px 0; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b;"">
                Your Privacy &amp; Asset Protection
              </p>
              <p style=""margin: 0; font-size: 11px; line-height: 17px; color: #64748b;"">
                All 3D assets, source models, and project configurations processed through your runners remain 100% your private intellectual property. Forgity Studio never accesses, collects, or uses your creative files to train machine learning models.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align=""center"" style=""padding: 24px 32px; background-color: #080c16;"">
              <p style=""margin: 0 0 8px 0; font-size: 11px; color: #475569;"">
                If the button above doesn't work, copy and paste this URL into your browser:
              </p>
              <p style=""margin: 0 0 16px 0; font-size: 11px; line-height: 16px; word-break: break-all; color: #6366f1;"">
                <a href=""{escapedInviteLink}"" style=""color: #818cf8; text-decoration: underline;"">{escapedInviteLink}</a>
              </p>
              <p style=""margin: 0; font-size: 10px; color: #475569;"">
                &copy; 2026 Forgity Studio. All rights reserved. You received this email because you signed up for early beta access.
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
}
