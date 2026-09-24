using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Identity;
using FastEndpoints;
using FluentResults;
using Wolverine;
using Automation.Identity.Constants;
using Automation.Identity.Domain;
using Automation.Identity.Infrastructure.Auth;

namespace Automation.Identity.Features.Users;

public class AssignUserRolesCommand
{
    [JsonIgnore]
    public Guid Id { get; set; }

    public List<string> Roles { get; set; } = [];
}

public class AssignUserRolesEndpoint(IMessageBus bus) : Endpoint<AssignUserRolesCommand, Result>
{
    public override void Configure()
    {
        Post("/{id}/roles");
        Group<UsersGroup>();
        Permissions(IdentityPermissions.Users.Update);
    }

    public override async Task HandleAsync(AssignUserRolesCommand req, CancellationToken ct)
    {
        req.Id = Route<Guid>("id");
        var result = await bus.InvokeAsync<Result>(req, ct);
        
        await this.SendResultAsync(result, ct);
    }
}

public class AssignUserRolesHandler(UserManager<User> userManager, RoleManager<Role> roleManager, IPermissionService permissionService)
{
    public async Task<Result> HandleAsync(AssignUserRolesCommand command, CancellationToken ct)
    {
        var user = await userManager.FindByIdAsync(command.Id.ToString());
        if (user == null || user.IsDeleted)
            return Result.Fail("User not found");

        var currentRoleNames = await userManager.GetRolesAsync(user);
        
        var requestedRoles = new List<string>();
        foreach (var roleId in command.Roles)
        {
            var role = await roleManager.FindByIdAsync(roleId);
            if (role != null && !string.IsNullOrEmpty(role.Name))
            {
                requestedRoles.Add(role.Name);
            }
        }
        
        var rolesToRemove = currentRoleNames.Except(requestedRoles).ToList();
        var rolesToAdd = requestedRoles.Except(currentRoleNames).ToList();

        if (rolesToRemove.Any())
        {
            var removeResult = await userManager.RemoveFromRolesAsync(user, rolesToRemove);
            if (!removeResult.Succeeded)
            {
                return Result.Fail(string.Join(", ", removeResult.Errors.Select(e => e.Description)));
            }
        }

        if (rolesToAdd.Any())
        {
            var addResult = await userManager.AddToRolesAsync(user, rolesToAdd);
            if (!addResult.Succeeded)
            {
                return Result.Fail(string.Join(", ", addResult.Errors.Select(e => e.Description)));
            }
        }
        if (rolesToRemove.Any() || rolesToAdd.Any())
        {
            await permissionService.ClearUserRolesCacheAsync(user.Id, ct);
        }

        return Result.Ok();
    }
}
