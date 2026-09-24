using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using FastEndpoints;
using FluentValidation;
using Wolverine.Attributes;
using Automation.Identity.Domain;

namespace Automation.Identity.Features.Profile;

public record ChangePasswordCommand(string CurrentPassword, string NewPassword)
{
    public Guid UserId { get; set; }
}

public class ChangePasswordValidator : Validator<ChangePasswordCommand>
{
    public ChangePasswordValidator()
    {
        RuleFor(x => x.CurrentPassword).NotEmpty().WithMessage("Current password is required.");
        RuleFor(x => x.NewPassword).NotEmpty().MinimumLength(6).WithMessage("New password must be at least 6 characters long.");
    }
}

public class ChangePasswordEndpoint(IMessageBus bus) : Endpoint<ChangePasswordCommand, string>
{
    public override void Configure()
    {
        Put("change-password");
        Group<ProfileGroup>();
    }

    public override async Task HandleAsync(ChangePasswordCommand req, CancellationToken ct)
    {
        var userIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (Guid.TryParse(userIdString, out var userId))
        {
            req.UserId = userId;
        }

        var result = await bus.InvokeAsync<FluentResults.Result<string>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(IdentityDbContext))]
public class ChangePasswordHandler(UserManager<User> userManager)
{
    public async Task<Result<string>> HandleAsync(ChangePasswordCommand command, CancellationToken ct)
    {
        var user = await userManager.FindByIdAsync(command.UserId.ToString());
        if (user == null || user.IsDeleted)
        {
            return Result.Fail("User not found.");
        }

        var result = await userManager.ChangePasswordAsync(user, command.CurrentPassword, command.NewPassword);
        
        if (!result.Succeeded)
        {
            var errors = string.Join(", ", result.Errors.Select(e => e.Description));
            return Result.Fail(errors);
        }

        return Result.Ok("Password changed successfully.");
    }
}
