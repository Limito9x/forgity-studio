using Microsoft.EntityFrameworkCore;
using Automation.Notifications.Domain;
using Automation.Notifications.Infrastructure.Persistence;
using Automation.Notifications.Shared.Dtos;

namespace Automation.Notifications.Features.Notifications;

public record MarkAllAsReadCommand
{
    public Guid UserId { get; set; }
}

public class MarkAllAsReadValidator : Validator<MarkAllAsReadCommand>
{
    public MarkAllAsReadValidator()
    {
    }
}

public class MarkAllAsReadEndpoint(IMessageBus bus) : Endpoint<MarkAllAsReadCommand, Result>
{
    public override void Configure()
    {
        Put("/mark-all-as-read");
        Group<NotificationsGroup>();
    }

    public override async Task HandleAsync(MarkAllAsReadCommand req, CancellationToken ct)
    {
        var userIdString = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(userIdString, out var userId))
        {
            HttpContext.Response.StatusCode = 401;
            return;
        }

        req.UserId = userId;
        var result = await bus.InvokeAsync<Result>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class MarkAllAsReadHandler(NotificationsDbContext dbContext)
{
    public async Task<Result> HandleAsync(
        MarkAllAsReadCommand request,
        CancellationToken cancellationToken)
    {
        await dbContext.Notifications
            .Where(x => x.UserId == request.UserId && !x.IsRead)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true), cancellationToken);
            
        return Result.Ok();
    }
}
