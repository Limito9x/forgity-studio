using Microsoft.AspNetCore.Identity;
using FastEndpoints;
using FluentValidation;
using Wolverine.Attributes;
using Wolverine;
using Automation.Identity.Domain.Enums;
using Automation.Identity.Domain;
using Automation.Identity.Infrastructure.Auth;
using Automation.SharedKernel.Extensions.Results;

namespace Automation.Identity.Features.Users;

public record BulkUpdateUserStatusCommand(List<Guid> UserIds, UserStatus TargetStatus);

public class BulkUpdateUserStatusValidator : Validator<BulkUpdateUserStatusCommand>
{
    public BulkUpdateUserStatusValidator()
    {
        RuleFor(x => x.UserIds).NotEmpty().WithMessage("At least one user ID is required.");
        RuleFor(x => x.TargetStatus).IsInEnum().WithMessage("Invalid target status.");
    }
}

public class BulkUpdateUserStatusEndpoint(IMessageBus bus) : Endpoint<BulkUpdateUserStatusCommand, string>
{
    public override void Configure()
    {
        Put("bulk-status");
        Group<UsersGroup>();
    }

    public override async Task HandleAsync(BulkUpdateUserStatusCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<FluentResults.Result<string>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(IdentityDbContext))]
public class BulkUpdateUserStatusHandler(UserManager<User> userManager, IPermissionService permissionService)
{
    public async Task<Result<string>> HandleAsync(BulkUpdateUserStatusCommand command, CancellationToken ct)
    {
        var users = new List<User>();
        foreach (var userId in command.UserIds)
        {
            var user = await userManager.FindByIdAsync(userId.ToString());
            if (user != null && !user.IsDeleted)
            {
                user.Status = command.TargetStatus;
                users.Add(user);
            }
        }

        if (users.Count == 0)
        {
            return Result.Fail("No valid users found to update.");
        }

        foreach (var user in users)
        {
            var result = await userManager.UpdateAsync(user);
            if (!result.Succeeded)
            {
                var errors = string.Join(", ", result.Errors.Select(e => e.Description));
                return Result.Fail($"Failed to update user {user.Id}: {errors}");
            }
            
            // Invalidate cache
            await permissionService.ClearUserStatusCacheAsync(user.Id, ct);
        }

        return Result.Ok($"Successfully updated status for {users.Count} user(s).");
    }
}
