using Microsoft.EntityFrameworkCore;
using Automation.Notifications.Infrastructure.Persistence;
using Automation.Notifications.Shared.Dtos;
using Automation.SharedKernel.Abstractions.Cursor;
using Automation.SharedKernel.Infrastructure.Cursor;

namespace Automation.Notifications.Features.Notifications;

public record GetNotificationsQuery : CursorParam;

public class GetNotificationsEndpoint(IMessageBus bus) : Endpoint<GetNotificationsQuery, CursorPage<NotificationDto>>
{
    public override void Configure()
    {
        Get("/");
        Group<NotificationsGroup>();
    }

    public override async Task HandleAsync(GetNotificationsQuery req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<CursorPage<NotificationDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class GetNotificationsHandler(ICurrentUserProvider userProvider, NotificationsDbContext dbContext)
{
    public async Task<Result<CursorPage<NotificationDto>>> HandleAsync(
        GetNotificationsQuery request,
        CancellationToken cancellationToken)
    {
        var currentUserId = userProvider.UserId;
        if (currentUserId == null)
        {
            return Result.Fail("User not found");
        }

        var cursorPageNotifications = await dbContext.Notifications
            .AsNoTracking()
            .Where(x => x.UserId == currentUserId && !x.ArchivedAt.HasValue)
            .ToCursorPageAsync(
                n => n.CreatedAt,
                n => n.Id,
                n => n.Adapt<NotificationDto>(),
                request,
                cancellationToken);

        return Result.Ok(cursorPageNotifications);
    }
}
