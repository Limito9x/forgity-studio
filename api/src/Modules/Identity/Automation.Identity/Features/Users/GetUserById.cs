using Microsoft.AspNetCore.Identity;
using Automation.Identity.Domain;

namespace Automation.Identity.Features.Users;

public record GetUserByIdQuery(Guid Id);

public class GetUserByIdEndpoint(IMessageBus bus) : EndpointWithoutRequest<UserDto>
{
    public override void Configure()
    {
        Get("/{Id}");
        Group<UsersGroup>();
        Permissions(P.Users.GetById);
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("Id");
        var result = await bus.InvokeAsync<Result<UserDto>>(new GetUserByIdQuery(id), ct);
        await this.SendResultAsync(result, ct);
    }
}

public class GetUserByIdHandler(UserManager<User> userManager, RoleManager<Role> roleManager)
{
    public async Task<Result<UserDto>> HandleAsync(GetUserByIdQuery query, CancellationToken ct)
    {
        var user = await userManager.FindByIdAsync(query.Id.ToString());
        if (user == null || user.IsDeleted)
            return Result.Fail("User not found");

        var roles = await userManager.GetRolesAsync(user);
        var roleIds = new List<Guid>();
        foreach (var roleName in roles)
        {
            var role = await roleManager.FindByNameAsync(roleName);
            if (role != null)
            {
                roleIds.Add(role.Id);
            }
        }

        var userDto = new UserDto(
            user.Id,
            user.UserName!,
            user.Email!,
            user.FirstName,
            user.LastName,
            user.DisplayName,
            user.Status,
            user.PhoneNumber ?? string.Empty,
            user.CreatedAt,
            roles,
            roleIds
        );

        return Result.Ok(userDto);
    }
}
