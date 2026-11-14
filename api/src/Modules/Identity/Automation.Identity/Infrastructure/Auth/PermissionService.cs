using Automation.Identity.Constants;
using Automation.Identity.Domain.Enums;
using Automation.SharedKernel.Abstractions.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Automation.Identity.Infrastructure.Auth;

public class PermissionService(
    IdentityDbContext dbContext,
    ICacheService cache,
    ILogger<PermissionService> logger,
    GlobalPermissionRegistry? registry = null
) : IPermissionService
{
    private static string GetUserRolesCacheKey(Guid userId) => $"users:{userId}:roles";
    private static string GetRolePermissionsCacheKey(Guid roleId, string stamp) => $"roles:{roleId}:v:{stamp}";
    private static string GetUserStatusCacheKey(Guid userId) => $"users:{userId}:status";

    public async Task<List<string>> GetPermissionsAsync(Guid userId, CancellationToken ct = default)
    {
        // 1. Super Admin bypass: SuperAdmin always has 100% of all registered system permissions
        var isSuperAdmin = await (from ur in dbContext.UserRoles
                                  where ur.UserId == userId
                                  join r in dbContext.Roles on ur.RoleId equals r.Id
                                  where r.Name == IdentityRoles.SuperAdmin
                                  select r.Id).AnyAsync(ct);

        if (isSuperAdmin && registry != null)
        {
            return registry.Modules
                .SelectMany(m => m.Value.Values)
                .SelectMany(p => p)
                .Distinct()
                .ToList();
        }

        var userRoleCacheKey = GetUserRolesCacheKey(userId);
        var userRoles = await cache.GetAsync<List<UserRoleCacheItem>>(userRoleCacheKey, ct);
        
        var allPermissions = new HashSet<string>();
        bool cacheMiss = userRoles == null;

        if (!cacheMiss)
        {
            foreach (var role in userRoles!)
            {
                var roleCacheKey = GetRolePermissionsCacheKey(role.RoleId, role.ConcurrencyStamp);
                var rolePerms = await cache.GetAsync<List<string>>(roleCacheKey, ct);
                
                if (rolePerms == null)
                {
                    cacheMiss = true;
                    break;
                }
                
                allPermissions.UnionWith(rolePerms);
            }
        }

        if (cacheMiss)
        {
            logger.LogWarning("--> Cache MISS! Fetching roles and permissions from Database for User {UserId}", userId);
            
            var userRolesQuery = await (from ur in dbContext.UserRoles
                                        where ur.UserId == userId
                                        join r in dbContext.Roles on ur.RoleId equals r.Id
                                        select new UserRoleCacheItem(r.Id, r.ConcurrencyStamp!))
                                        .ToListAsync(ct);
            
            await cache.SetAsync(userRoleCacheKey, userRolesQuery, TimeSpan.FromHours(2), ct);
            
            allPermissions.Clear();

            foreach (var role in userRolesQuery)
            {
                var roleClaims = await dbContext.RoleClaims
                    .Where(rc => rc.RoleId == role.RoleId && rc.ClaimType == "Permission")
                    .Select(rc => rc.ClaimValue)
                    .ToListAsync(ct);
                    
                var nonNullRoleClaims = roleClaims.Where(x => !string.IsNullOrEmpty(x)).ToList();
                await CacheRolePermissionsAsync(role.RoleId, role.ConcurrencyStamp, nonNullRoleClaims!, ct);
                allPermissions.UnionWith(nonNullRoleClaims!);
            }
        }

        return allPermissions.ToList();
    }

    public async Task ClearRolePermissionsCacheAsync(Guid roleId, string stamp, CancellationToken ct = default)
    {
        var roleCacheKey = GetRolePermissionsCacheKey(roleId, stamp);
        await cache.RemoveAsync(roleCacheKey, ct);
    }

    public async Task CacheRolePermissionsAsync(Guid roleId, string concurrencyStamp, List<string> permissions, CancellationToken ct = default)
    {
        var roleCacheKey = GetRolePermissionsCacheKey(roleId, concurrencyStamp);
        // Role permissions with specific version are immutable, cache for a long time
        await cache.SetAsync(roleCacheKey, permissions, TimeSpan.FromDays(7), ct);
    }

    public async Task<bool> IsUserActiveAsync(Guid userId, CancellationToken ct = default)
    {
        var cacheKey = GetUserStatusCacheKey(userId);
        var cachedStatus = await cache.GetAsync<UserStatus?>(cacheKey, ct);
        
        if (cachedStatus.HasValue)
        {
            return cachedStatus.Value == UserStatus.Active;
        }

        var status = await dbContext.Users
            .Where(u => u.Id == userId)
            .Select(u => u.Status)
            .FirstOrDefaultAsync(ct);
            
        await cache.SetAsync(cacheKey, status, TimeSpan.FromHours(2), ct);
        
        return status == UserStatus.Active;
    }

    public async Task ClearUserStatusCacheAsync(Guid userId, CancellationToken ct = default)
    {
        var cacheKey = GetUserStatusCacheKey(userId);
        await cache.RemoveAsync(cacheKey, ct);
    }

    public async Task ClearUserRolesCacheAsync(Guid userId, CancellationToken ct = default)
    {
        var cacheKey = GetUserRolesCacheKey(userId);
        await cache.RemoveAsync(cacheKey, ct);
    }
}



