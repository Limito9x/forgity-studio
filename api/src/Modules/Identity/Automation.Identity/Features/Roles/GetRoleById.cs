using Microsoft.AspNetCore.Identity;
using Automation.Identity.Domain;
using Automation.Identity.Shared.Dtos;

namespace Automation.Identity.Features.Roles;

public record GetRoleByIdQuery(Guid Id);

public class GetRoleByIdEndpoint(IMessageBus bus)
    : Endpoint<GetRoleByIdQuery, RoleDto>
{
    public override void Configure()
    {
        Get("/{id}");
        Group<RolesGroup>();
        Permissions(P.Roles.GetById);
    }

    public override async Task HandleAsync(
        GetRoleByIdQuery req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<RoleDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class GetRoleByIdHandler(RoleManager<Role> roleManager)
{
    public async Task<Result<RoleDto>> HandleAsync(
        GetRoleByIdQuery query,
        CancellationToken ct)
    {
        var role = await roleManager.FindByIdAsync(query.Id.ToString());
        if (role == null)
            return Result.Fail("Role not found");

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
