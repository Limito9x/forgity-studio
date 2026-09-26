using Microsoft.EntityFrameworkCore;
using Automation.Identity.Domain;
using Gridify;

namespace Automation.Identity.Features.Users;

public class GetUsersQuery : PagedQuery;

public class GetUsersEndpoint(IMessageBus bus) : Endpoint<GetUsersQuery, PagedResult<UserDto>>
{
    public override void Configure()
    {
        Get("/");
        Group<UsersGroup>();
        Permissions(P.Users.GetAll);
        RequestBinder(new PagedQueryBinder<GetUsersQuery>());
    }

    public override async Task HandleAsync(GetUsersQuery req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<PagedResult<UserDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class GetUsersHandler(IdentityDbContext db)
{
    public async Task<Result<PagedResult<UserDto>>> HandleAsync(GetUsersQuery query, CancellationToken ct)
    {
        var mapper = new GridifyMapper<User>()
            .GenerateMappings()
            .RemoveMap(nameof(User.PasswordHash))
            .RemoveMap(nameof(User.SecurityStamp));

        var pagedResult = await db.Users
            .AsNoTracking()
            .ToPagedResultAsync(query, mapper, ct);

        if (pagedResult.IsFailed)
            return Result.Fail(pagedResult.Errors);

        var pagedUsers = pagedResult.Value;

        var userIds = pagedUsers.Items.Select(u => u.Id).ToList();

        var userRoles = await db.UserRoles
            .Where(ur => userIds.Contains(ur.UserId))
            .Join(db.Roles, ur => ur.RoleId, r => r.Id, (ur, r) => new { ur.UserId, RoleName = r.Name, RoleId = r.Id })
            .ToListAsync(ct);

        var dtos = pagedUsers.Items.Select(u => new UserDto(
            u.Id,
            u.UserName ?? string.Empty,
            u.Email ?? string.Empty,
            u.FirstName,
            u.LastName,
            u.DisplayName,
            u.Status,
            u.PhoneNumber ?? string.Empty,
            u.CreatedAt,
            userRoles.Where(ur => ur.UserId == u.Id).Select(ur => ur.RoleName!),
            userRoles.Where(ur => ur.UserId == u.Id).Select(ur => ur.RoleId)
        )).ToList();

        return Result.Ok(PagedResult<UserDto>.From(
            dtos, pagedUsers.TotalCount, pagedUsers.Page, pagedUsers.PageSize));
    }
}
