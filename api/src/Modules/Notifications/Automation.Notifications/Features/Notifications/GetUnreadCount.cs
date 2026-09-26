using Microsoft.EntityFrameworkCore;
using Automation.Notifications.Infrastructure.Persistence;
using Automation.SharedKernel.Errors;

namespace Automation.Notifications.Features.Notifications;

public record GetUnreadCountQuery;

public class GetUnreadCountEndpoint(IMessageBus bus) : EndpointWithoutRequest<int>
{
    public override void Configure()
    {
        Get("/unread-count");
        Group<NotificationsGroup>();
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<int>>(new GetUnreadCountQuery(), ct);
        await this.SendResultAsync(result, ct);
    }
}

public class GetUnreadCountHandler(ICurrentUserProvider userProvider, NotificationsDbContext dbContext)
{
    public async Task<Result<int>> HandleAsync(
        GetUnreadCountQuery request,
        CancellationToken cancellationToken)
    {
        var userId = userProvider.UserId;

        if(userId == null) 
        {
            return Result.Fail(new NotFoundError("User not found!"));
        }

        var count = await dbContext.Notifications
            .AsNoTracking()
            .CountAsync(x => x.UserId == userId && !x.IsRead && !x.ArchivedAt.HasValue, cancellationToken);
            
        return Result.Ok(count);
    }
}
