using Microsoft.AspNetCore.Identity;
using Automation.Identity.Domain;
using Automation.Identity.Shared.Dtos;

namespace Automation.Identity.Features.Roles;

public record UpdateRoleCommand(Guid Id, string Name);

public class UpdateRoleValidator : Validator<UpdateRoleCommand>
{
    public UpdateRoleValidator()
    {
        RuleFor(x => x.Id)
            .NotEmpty()
            .WithMessage("Id is required");
            
        RuleFor(x => x.Name)
            .NotEmpty()
            .WithMessage("Name is required");
    }
}

public class UpdateRoleEndpoint(IMessageBus bus)
    : Endpoint<UpdateRoleCommand, RoleDto>
{
    public override void Configure()
    {
        Put("/{id}");
        Group<RolesGroup>();
        Permissions(P.Roles.Update);
    }

    public override async Task HandleAsync(
        UpdateRoleCommand req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<RoleDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class UpdateRoleHandler(RoleManager<Role> roleManager)
{
    public async Task<Result<RoleDto>> HandleAsync(
        UpdateRoleCommand request,
        CancellationToken cancellationToken)
    {
        var role = await roleManager.FindByIdAsync(request.Id.ToString());
        if (role == null)
            return Result.Fail("Role not found");

        role.Name = request.Name;

        var result = await roleManager.UpdateAsync(role);

        if (!result.Succeeded)
        {
            var errors = string.Join(", ", result.Errors.Select(e => e.Description));
            return Result.Fail("Failed to update role: " + errors);
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
