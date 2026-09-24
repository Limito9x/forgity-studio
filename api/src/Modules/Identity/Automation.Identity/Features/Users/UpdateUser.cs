using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Identity;
using Automation.Identity.Domain.Enums;
using Automation.Identity.Domain;

namespace Automation.Identity.Features.Users;

public class UpdateUserCommand
{
    [JsonIgnore]
    public Guid Id { get; set; }

    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
}

public class UpdateUserValidator : Validator<UpdateUserCommand>
{
    public UpdateUserValidator()
    {
        RuleFor(x => x.FirstName)
            .NotEmpty()
            .WithMessage("First name is required.");

        RuleFor(x => x.LastName)
            .NotEmpty()
            .WithMessage("Last name is required.");    
    }
}

public class UpdateUserEndpoint(IMessageBus bus) : Endpoint<UpdateUserCommand, string>
{
    public override void Configure()
    {
        Put("/{Id}");
        Group<UsersGroup>();
        Permissions(P.Users.Update);
    }

    public override async Task HandleAsync(UpdateUserCommand req, CancellationToken ct)
    {
        req.Id = Route<Guid>("Id");
        var result = await bus.InvokeAsync<Result<string>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class UpdateUserHandler(UserManager<User> userManager)
{
    public async Task<Result<string>> HandleAsync(UpdateUserCommand command, CancellationToken ct)
    {
        var user = await userManager.FindByIdAsync(command.Id.ToString());
        if (user == null || user.IsDeleted)
            return Result.Fail("User not found");

        user.FirstName = command.FirstName;
        user.LastName = command.LastName;
        user.DisplayName = string.IsNullOrWhiteSpace(command.DisplayName) 
            ? $"{command.FirstName} {command.LastName}".Trim() 
            : command.DisplayName;
        user.PhoneNumber = command.PhoneNumber;

        var result = await userManager.UpdateAsync(user);
        if (!result.Succeeded)
        {
            var errors = string.Join(", ", result.Errors.Select(e => e.Description));
            return Result.Fail("Failed to update user: " + errors);
        }

        return Result.Ok("User updated successfully");
    }
}
