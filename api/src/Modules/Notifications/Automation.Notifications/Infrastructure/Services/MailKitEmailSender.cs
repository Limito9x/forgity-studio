using Automation.Notifications.Domain.Interfaces;
using MailKit.Net.Smtp;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using MimeKit;

namespace Automation.Notifications.Infrastructure.Services;

public class MailKitEmailSender : IEmailSender
{
    private readonly IConfiguration _config;
    private readonly ILogger<MailKitEmailSender> _logger;

    public MailKitEmailSender(IConfiguration config, ILogger<MailKitEmailSender> logger)
    {
        _config = config;
        _logger = logger;
    }

    public async Task SendAsync(
        string to,
        string subject,
        string body,
        bool isHtml = true,
        string? plainTextBody = null,
        CancellationToken ct = default)
    {
        var host = _config["Smtp:Host"] ?? "localhost";
        var portStr = _config["Smtp:Port"] ?? "25";
        int.TryParse(portStr, out var port);
        var user = _config["Smtp:Username"];
        var pass = _config["Smtp:Password"];
        var from = _config["Smtp:From"] ?? "noreply@example.com";
        var fromName = _config["Smtp:FromName"] ?? "Forgity Studio";

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(fromName, from));
        message.To.Add(new MailboxAddress(to, to));
        message.Subject = subject;

        var bodyBuilder = new BodyBuilder();

        // 1. Plain text body (crucial for anti-spam filters & non-HTML clients)
        if (!string.IsNullOrWhiteSpace(plainTextBody))
        {
            bodyBuilder.TextBody = plainTextBody;
        }
        else if (!isHtml)
        {
            bodyBuilder.TextBody = body;
        }

        // 2. HTML body
        if (isHtml)
        {
            bodyBuilder.HtmlBody = body;
        }

        // MimeKit automatically constructs multipart/alternative when both TextBody and HtmlBody are set
        message.Body = bodyBuilder.ToMessageBody();

        try
        {
            using var client = new SmtpClient();
            
            // For demo/dev purposes, accept all SSL certificates (in case the server supports STARTTLS/SSL)
            client.ServerCertificateValidationCallback = (s, c, h, e) => true;

            await client.ConnectAsync(host, port, MailKit.Security.SecureSocketOptions.Auto, ct);

            if (!string.IsNullOrEmpty(user) && !string.IsNullOrEmpty(pass))
            {
                await client.AuthenticateAsync(user, pass, ct);
            }

            await client.SendAsync(message, ct);
            await client.DisconnectAsync(true, ct);

            _logger.LogInformation(
                "Email sent successfully to {To} with subject {Subject} (Multipart: {HasPlainAndHtml})",
                to,
                subject,
                !string.IsNullOrWhiteSpace(bodyBuilder.TextBody) && !string.IsNullOrWhiteSpace(bodyBuilder.HtmlBody)
            );
        }
        catch (System.Exception ex)
        {
            _logger.LogError(ex, "Failed to send email to {To}", to);
            // Re-throw if you want it to retry via Wolverine
            throw;
        }
    }
}
