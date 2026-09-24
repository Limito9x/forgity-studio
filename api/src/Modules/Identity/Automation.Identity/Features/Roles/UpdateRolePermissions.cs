using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using FastEndpoints;
using FluentValidation;
using Automation.Identity.Domain;
using Automation.Identity.Infrastructure.Auth;

namespace Automation.Identity.Features.Roles;

public record UpdateRolePermissionsCommand(Guid Id, List<string> Permissions);

public class UpdateRolePermissionsValidator : Validator<UpdateRolePermissionsCommand>
{
    public UpdateRolePermissionsValidator()
    {
        RuleFor(x => x.Id)
            .NotEmpty()
            .WithMessage("Id is required");

        RuleFor(x => x.Permissions)
            .NotNull()
            .WithMessage("Permissions list is required");
    }
}

public class UpdateRolePermissionsEndpoint(IMessageBus bus)
    : Endpoint<UpdateRolePermissionsCommand>
{
    public override void Configure()
    {
        Put("/{id}/permissions");
        Group<RolesGroup>();
        Permissions(P.RolesFeature.Assign);
    }

    public override async Task HandleAsync(
        UpdateRolePermissionsCommand req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class UpdateRolePermissionsHandler(
    RoleManager<Role> roleManager,
    IPermissionService permissionService)
{
    public async Task<Result> Handle(
        UpdateRolePermissionsCommand request,
        CancellationToken cancellationToken)
    {
        var role = await roleManager.FindByIdAsync(request.Id.ToString());
        if (role is null)
        {
            return Result.Fail($"Role with ID {request.Id} not found");
        }

        var oldStamp = role.ConcurrencyStamp;

        var existingClaims = await roleManager.GetClaimsAsync(role);
        var permissionClaims = existingClaims.Where(c => c.Type == "Permission").ToList();

        // Remove old permissions
        foreach (var claim in permissionClaims)
        {
            await roleManager.RemoveClaimAsync(role, claim);
        }

        // Add new permissions
        var newPermissions = request.Permissions?.Distinct().ToList() ?? [];
        foreach (var permission in newPermissions)
        {
            await roleManager.AddClaimAsync(role, new Claim("Permission", permission));
        }

        // Reload role d? l?y ConcurrencyStamp ?n d?nh sau t?t c? thay d?i
        // (m?i Add/RemoveClaimAsync d?u t? UpdateAsync và d?i stamp)
        var reloadedRole = await roleManager.FindByIdAsync(request.Id.ToString());
        if (reloadedRole is null)
        {
            return Result.Fail("Role not found after update");
        }

        var newStamp = reloadedRole.ConcurrencyStamp;

        // Xoá cache phiên b?n cu (keyed b?ng oldStamp)
        if (!string.IsNullOrEmpty(oldStamp))
        {
            await permissionService.ClearRolePermissionsCacheAsync(reloadedRole.Id, oldStamp, cancellationToken);
        }

        // Ghi cache phiên b?n m?i (keyed b?ng newStamp)
        if (!string.IsNullOrEmpty(newStamp))
        {
            await permissionService.CacheRolePermissionsAsync(reloadedRole.Id, newStamp, newPermissions, cancellationToken);
        }

        return Result.Ok();
    }
}
