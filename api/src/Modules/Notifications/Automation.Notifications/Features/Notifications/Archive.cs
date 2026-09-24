using Microsoft.EntityFrameworkCore;
using Automation.Notifications.Domain;
using Automation.Notifications.Infrastructure.Persistence;
using Automation.Notifications.Shared.Dtos;

namespace Automation.Notifications.Features.Notifications;

public record ArchiveCommand(Guid Id)
{
    public Guid UserId { get; set; }
}

public class ArchiveValidator : Validator<ArchiveCommand>
{
    public ArchiveValidator()
    {
        RuleFor(x => x.Id)
            .NotEmpty()
            .WithMessage("Id is required");
    }
}

public class ArchiveEndpoint(IMessageBus bus) : Endpoint<ArchiveCommand, Result>
{
    public override void Configure()
    {
        Put("/{id}/archive");
        Group<NotificationsGroup>();
    }

    public override async Task HandleAsync(ArchiveCommand req, CancellationToken ct)
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

public class ArchiveHandler(NotificationsDbContext dbContext)
{
    public async Task<Result> HandleAsync(
        ArchiveCommand request,
        CancellationToken cancellationToken)
    {
        var notification = await dbContext.Notifications
            .FirstOrDefaultAsync(x => x.Id == request.Id && x.UserId == request.UserId, cancellationToken);
            
        if (notification is null)
            return Result.Fail(new Error("Notification not found").WithMetadata("StatusCode", 404));

        notification.ArchivedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        
        return Result.Ok();
    }
}
