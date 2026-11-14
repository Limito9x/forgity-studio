using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using FastEndpoints;
using Wolverine;
using Automation.Identity.Domain;

namespace Automation.Identity.Features.Roles;

public record GetRolePermissionsQuery(Guid Id);

public class GetRolePermissionsEndpoint(IMessageBus bus)
    : Endpoint<GetRolePermissionsQuery, List<string>>
{
    public override void Configure()
    {
        Get("/{id}/permissions");
        Group<RolesGroup>();
        Permissions(P.RolesFeature.Assign);
        
    }

    public override async Task HandleAsync(
        GetRolePermissionsQuery req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<List<string>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class GetRolePermissionsHandler(RoleManager<Role> roleManager)
{
    public async Task<Result<List<string>>> Handle(GetRolePermissionsQuery query, CancellationToken ct)
    {
        var role = await roleManager.FindByIdAsync(query.Id.ToString());
        if (role is null)
        {
            return Result.Fail($"Role with ID {query.Id} not found");
        }

        var claims = await roleManager.GetClaimsAsync(role);
        var permissions = claims
            .Where(c => c.Type == "Permission")
            .Select(c => c.Value)
            .ToList();

        return Result.Ok(permissions);
    }
}
