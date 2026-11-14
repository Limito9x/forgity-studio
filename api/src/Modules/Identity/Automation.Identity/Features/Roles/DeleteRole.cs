using Microsoft.AspNetCore.Identity;
using Automation.Identity.Domain;
using Automation.Identity.Shared.Dtos;

namespace Automation.Identity.Features.Roles;

public record DeleteRoleCommand(Guid Id);

public class DeleteRoleEndpoint(IMessageBus bus)
    : Endpoint<DeleteRoleCommand>
{
    public override void Configure()
    {
        Delete("/{id}");
        Group<RolesGroup>();
        Permissions(P.Roles.Delete);
    }

    public override async Task HandleAsync(
        DeleteRoleCommand req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class DeleteRoleHandler(RoleManager<Role> roleManager)
{
    public async Task<Result> HandleAsync(
        DeleteRoleCommand command,
        CancellationToken ct)
    {
        var role = await roleManager.FindByIdAsync(command.Id.ToString());
        if (role == null)
            return Result.Fail("Role not found");

        var result = await roleManager.DeleteAsync(role);

        if (!result.Succeeded)
        {
            var errors = string.Join(", ", result.Errors.Select(e => e.Description));
            return Result.Fail("Failed to delete role: " + errors);
        }
        
        return Result.Ok();
    }
}
