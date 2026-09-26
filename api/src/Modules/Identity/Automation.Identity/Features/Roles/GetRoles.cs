using Microsoft.EntityFrameworkCore;
using Automation.Identity.Domain;
using Automation.Identity.Infrastructure.Persistence;
using Gridify;

namespace Automation.Identity.Features.Roles;

public class GetRolesQuery : PagedQuery;

public class GetRolesEndpoint(IMessageBus bus)
    : Endpoint<GetRolesQuery, PagedResult<RoleDto>>
{
    public override void Configure()
    {
        Get("/");
        Group<RolesGroup>();
        Permissions(P.Roles.GetAll);
        RequestBinder(new PagedQueryBinder<GetRolesQuery>());
    }

    public override async Task HandleAsync(
        GetRolesQuery req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<PagedResult<RoleDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class GetRolesHandler(IdentityDbContext db)
{
    public async Task<Result<PagedResult<RoleDto>>> HandleAsync(
        GetRolesQuery query,
        CancellationToken ct)
    {
        var mapper = new GridifyMapper<Role>()
            .GenerateMappings();

        var pagedResult = await db.Roles
            .AsNoTracking()
            .ToPagedResultAsync(query, mapper, ct);
            
        if (pagedResult.IsFailed)
            return Result.Fail(pagedResult.Errors);

        var dtos = pagedResult.Value.Items.Select(r => new RoleDto(
            r.Id, 
            r.Name ?? string.Empty, 
            r.CreatedAt, 
            r.CreatedBy, 
            r.UpdatedAt, 
            r.UpdatedBy
        )).ToList();

        return Result.Ok(PagedResult<RoleDto>.From(
            dtos, pagedResult.Value.TotalCount, pagedResult.Value.Page, pagedResult.Value.PageSize));
    }
}
