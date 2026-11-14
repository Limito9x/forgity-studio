using Microsoft.EntityFrameworkCore;
using Automation.Notifications.Infrastructure.Persistence;
using Automation.SharedKernel.Errors;

namespace Automation.Notifications.Features.Notifications;

public record MarkAsReadCommand(List<Guid> Ids);

public class MarkAsReadValidator : Validator<MarkAsReadCommand>
{
    public MarkAsReadValidator()
    {
        RuleFor(x => x.Ids)
            .NotEmpty()
            .WithMessage("Ids is required");
    }
}

public class MarkAsReadEndpoint(IMessageBus bus) : Endpoint<MarkAsReadCommand, Result>
{
    public override void Configure()
    {
        Patch("/mark-as-read");
        Group<NotificationsGroup>();
    }

    public override async Task HandleAsync(MarkAsReadCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class MarkAsReadHandler(ICurrentUserProvider userProvider, NotificationsDbContext dbContext)
{
    public async Task<Result> HandleAsync(
        MarkAsReadCommand request,
        CancellationToken cancellationToken)
    {
        var currentUserId = userProvider.UserId;
        if (currentUserId == null)
        {
            return Result.Fail("User not found");
        }

        var updatedCount = await dbContext.Notifications.Where(x => request.Ids.Contains(x.Id) && x.UserId == currentUserId)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true), cancellationToken);
        
        if (updatedCount == 0)
            return Result.Fail(new NotFoundError("Notification not found"));
        
        return Result.Ok();
    }
}
