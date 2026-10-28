using System.Threading;
using System.Threading.Tasks;

namespace Automation.Notifications.Domain.Interfaces;

public interface IEmailSender
{
    Task SendAsync(
        string to,
        string subject,
        string body,
        bool isHtml = true,
        string? plainTextBody = null,
        CancellationToken ct = default);
}
