namespace Automation.Notifications.Contracts.Messages;

public record SendEmailCommand(
    string To,
    string Subject,
    string Body,
    bool IsHtml = true,
    string? PlainTextBody = null
);
