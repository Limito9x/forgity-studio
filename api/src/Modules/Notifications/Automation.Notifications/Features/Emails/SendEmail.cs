using Automation.Notifications.Contracts.Messages;
using Automation.Notifications.Domain.Interfaces;

namespace Automation.Notifications.Features.Emails;

public static class SendEmailCommandHandler
{
    public static async Task HandleAsync(SendEmailCommand command, IEmailSender emailSender, CancellationToken ct)
    {
        await emailSender.SendAsync(
            to: command.To,
            subject: command.Subject,
            body: command.Body,
            isHtml: command.IsHtml,
            ct: ct
        );
    }
}
