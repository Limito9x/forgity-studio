using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Automation.Notifications.Contracts.Messages;
using Automation.Notifications.Domain.Entities;
using Automation.Notifications.Domain.Enums;
using Automation.Notifications.Infrastructure.Persistence;

namespace Automation.Notifications.Features.Notifications;

public class SystemNotificationCreatedHandler(
    NotificationsDbContext db,
    IHubContext<NotificationHub> hubContext)
{
    public async Task HandleAsync(SystemNotificationCreatedMessage message, CancellationToken ct)
    {
        var severity = Enum.TryParse<NotificationSeverity>(message.Severity, true, out var parsedSeverity)
            ? parsedSeverity
            : NotificationSeverity.Info;

        JsonDocument? data = null;
        if (!string.IsNullOrWhiteSpace(message.DataJson))
        {
            try
            {
                data = JsonDocument.Parse(message.DataJson);
            }
            catch
            {
                // Ignore parse errors, fallback to null
            }
        }

        var notification = new Notification
        {
            UserId = message.UserId,
            Title = message.Title,
            Message = message.Message,
            Type = message.Type,
            Severity = severity,
            Data = data,
            IsRead = false
        };

        db.Notifications.Add(notification);
        await db.SaveChangesAsync(ct);

        // SignalR realtime push
        await hubContext.Clients.User(message.UserId.ToString())
            .SendAsync("ReceiveNewNotification", notification, ct);
    }
}
