using Microsoft.EntityFrameworkCore;
using FluentResults;
using Automation.Identity.Infrastructure.Persistence;
using Automation.Identity.Shared.Dtos;

namespace Automation.Identity.Features.Roles;

public class GetRoleOptionsQuery 
{
}

public class GetRoleOptionsEndpoint(IMessageBus bus)
    : EndpointWithoutRequest<List<RoleDto>>
{
    public override void Configure()
    {
        Get("/options");
        Group<RolesGroup>();
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<List<RoleDto>>>(new GetRoleOptionsQuery(), ct);
        await this.SendResultAsync(result, ct);
    }
}

public class GetRoleOptionsHandler(IdentityDbContext db)
{
    public async Task<Result<List<RoleDto>>> HandleAsync(
        GetRoleOptionsQuery query,
        CancellationToken ct)
    {
        var roles = await db.Roles
            .AsNoTracking()
            .Select(r => new RoleDto(
                r.Id, 
                r.Name ?? string.Empty,
                r.CreatedAt,
                r.CreatedBy,
                r.UpdatedAt,
                r.UpdatedBy
            ))
            .ToListAsync(ct);

        return Result.Ok(roles);
    }
}
