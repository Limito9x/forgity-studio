using Microsoft.AspNetCore.Identity;
using Automation.Identity.Domain;
using Automation.Identity.Shared.Dtos;

namespace Automation.Identity.Features.Roles;

public record CreateRoleCommand(string Name);

public class CreateRoleValidator : Validator<CreateRoleCommand>
{
    public CreateRoleValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty()
            .WithMessage("Name is required");
    }
}

public class CreateRoleEndpoint(IMessageBus bus)
    : Endpoint<CreateRoleCommand, RoleDto>
{
    public override void Configure()
    {
        Post("/"); // Change this method/route accordingly
        Group<RolesGroup>();
        Permissions(P.Roles.Create);
    }

    public override async Task HandleAsync(
        CreateRoleCommand req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<RoleDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class CreateRoleHandler(RoleManager<Role> roleManager)
{
    public async Task<Result<RoleDto>> HandleAsync(
        CreateRoleCommand request,
        CancellationToken cancellationToken)
    {
        var role = new Role
        {
            Name = request.Name
        };

        var result = await roleManager.CreateAsync(role);

        if (!result.Succeeded)
        {
            var errors = string.Join(", ", result.Errors.Select(e => e.Description));
            return Result.Fail("Failed to create role: " + errors);
        }

        return Result.Ok(new RoleDto(
            role.Id, 
            role.Name ?? string.Empty,
            role.CreatedAt,
            role.CreatedBy,
            role.UpdatedAt,
            role.UpdatedBy
        ));
    }
}
