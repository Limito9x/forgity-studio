using Automation.Identity.Constants;
using Automation.Identity.Domain;
using Automation.SharedKernel.Abstractions.Auth;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.Security.Claims;

namespace Automation.Identity.Infrastructure;

public class IdentityInitializer(
    IServiceProvider serviceProvider,
    ILogger<IdentityInitializer> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        using var scope = serviceProvider.CreateScope();
        
        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<Role>>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<User>>();
        var permissionRegistry = scope.ServiceProvider.GetRequiredService<GlobalPermissionRegistry>();
        var config = scope.ServiceProvider.GetRequiredService<Microsoft.Extensions.Configuration.IConfiguration>();

        await SeedRolesAsync(roleManager);
        await SeedPermissionsForSuperAdminAsync(roleManager, permissionRegistry);
        await SeedDefaultUserAsync(userManager, config);
    }

    private async Task SeedRolesAsync(RoleManager<Role> roleManager)
    {
        foreach (var roleName in IdentityRoles.DefaultRoles)
        {
            if (!await roleManager.RoleExistsAsync(roleName))
            {
                logger.LogInformation("Creating role {RoleName}", roleName);
                await roleManager.CreateAsync(new Role { Name = roleName });
            }
        }
    }

    private async Task SeedPermissionsForSuperAdminAsync(RoleManager<Role> roleManager, GlobalPermissionRegistry registry)
    {
        var superAdminRole = await roleManager.FindByNameAsync(IdentityRoles.SuperAdmin);
        if (superAdminRole is null) return;

        var existingClaims = await roleManager.GetClaimsAsync(superAdminRole);
        var existingPermissions = existingClaims
            .Where(c => c.Type == "Permission")
            .Select(c => c.Value)
            .ToHashSet();

        var allPermissions = registry.Modules
            .SelectMany(m => m.Value.Values)
            .SelectMany(p => p)
            .Distinct()
            .ToList();

        var newPermissions = allPermissions.Where(p => !existingPermissions.Contains(p)).ToList();

        foreach (var permission in newPermissions)
        {
            logger.LogInformation("Granting permission {Permission} to {Role}", permission, IdentityRoles.SuperAdmin);
            await roleManager.AddClaimAsync(superAdminRole, new Claim("Permission", permission));
        }
    }

    private async Task SeedDefaultUserAsync(UserManager<User> userManager, Microsoft.Extensions.Configuration.IConfiguration config)
    {
        // 1. Kiểm tra nếu hệ thống ĐÃ CÓ ít nhất 1 Super Admin -> KHÔNG BAO GIỜ tự sinh thêm tài khoản
        var existingAdmins = await userManager.GetUsersInRoleAsync(IdentityRoles.SuperAdmin);
        if (existingAdmins.Count > 0)
        {
            return;
        }

        // 2. Chỉ sinh tài khoản Root duy nhất 1 lần khi Database MỚI TINH (Fresh Database)
        var defaultEmail = config["InitialAdmin:Email"] ?? "forgity.studio@gmail.com";
        var defaultPassword = config["InitialAdmin:Password"] ?? "Admin@123!";

        logger.LogInformation("Phát hiện Database mới. Khởi tạo Super Admin đầu tiên: {Email}", defaultEmail);
        var user = new User
        {
            UserName = defaultEmail,
            Email = defaultEmail,
            FirstName = "Super",
            LastName = "Admin",
            DisplayName = "Super Admin",
            EmailConfirmed = true
        };

        var result = await userManager.CreateAsync(user, defaultPassword);
        if (result.Succeeded)
        {
            await userManager.AddToRoleAsync(user, IdentityRoles.SuperAdmin);
            logger.LogInformation("Khởi tạo Super Admin thành công.");
        }
        else
        {
            logger.LogError("Không thể tạo Super Admin ban đầu: {Errors}", string.Join(", ", result.Errors.Select(e => e.Description)));
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}



