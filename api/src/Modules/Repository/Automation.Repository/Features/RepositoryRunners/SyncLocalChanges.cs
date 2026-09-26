using Automation.Repository.Contracts;
using Automation.Repository.Domain.Entities;
using Automation.Repository.Infrastructure.Persistence;
using Automation.Repository.Shared.Dtos;
using Automation.Repository.Shared.Helpers;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Repository.Features.RepositoryRunners;

public record SyncLocalChangesCommand(
    Guid RepositoryId,
    Guid RunnerId,
    string? Notes,
    List<string> TargetPaths,
    List<string>? RemovedPaths = null
);

public class SyncLocalChangesValidator : AbstractValidator<SyncLocalChangesCommand>
{
    public SyncLocalChangesValidator()
    {
        RuleFor(x => x.RepositoryId).NotEmpty();
        RuleFor(x => x.RunnerId).NotEmpty();
        RuleFor(x => x.TargetPaths).NotNull();
    }
}

public class SyncLocalChangesEndpoint(IMessageBus bus)
    : Endpoint<SyncLocalChangesCommand, SyncLocalChangesResultDto>
{
    public override void Configure()
    {
        Post("sync-local");
        Group<RepositoryRunnersGroup>();
        Permissions(P.RepositoryRunner.Update);
        Description(x => x.WithName("SyncLocalChanges"));
    }

    public override async Task HandleAsync(SyncLocalChangesCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<SyncLocalChangesResultDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(RepositoryDbContext))]
public class SyncLocalChangesHandler(RepositoryDbContext dbContext, IMessageBus bus)
{
    public async Task<Result<SyncLocalChangesResultDto>> HandleAsync(
        SyncLocalChangesCommand cmd,
        CancellationToken ct
    )
    {
        var compareCmd = new CompareRepositoryResourcesCommand(cmd.RepositoryId, cmd.RunnerId);

        var diffResult = await bus.InvokeAsync<Result<DiffResult>>(compareCmd);
        if (diffResult.IsFailed)
            return Result.Fail(diffResult.Errors);

        var diff = diffResult.Value;
        var repositoryRunnerId = diff.RepositoryRunnerId;

        var repositoryRunner = await dbContext.RepositoryRunners.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == repositoryRunnerId, ct);
        var rootPath = repositoryRunner?.RootPath;

        // Chuẩn hóa và chuyển đổi mọi target path thành relative path
        var normalizedLookup = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var candidateRelativePaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var path in cmd.TargetPaths.Where(p => !string.IsNullOrWhiteSpace(p)))
        {
            var rel = ToRelativePath(path, rootPath);
            normalizedLookup[path] = rel;

            candidateRelativePaths.Add(rel);
            candidateRelativePaths.Add(rel.Replace('\\', '/'));
            candidateRelativePaths.Add(rel.Replace('/', '\\'));

            candidateRelativePaths.Add(path);
            candidateRelativePaths.Add(path.Replace('\\', '/'));
            candidateRelativePaths.Add(path.Replace('/', '\\'));
        }

        bool IsTargetMatch(string relPath)
        {
            if (candidateRelativePaths.Count == 0) return true;
            if (candidateRelativePaths.Contains(relPath)) return true;
            if (candidateRelativePaths.Contains(relPath.Replace('\\', '/'))) return true;
            if (candidateRelativePaths.Contains(relPath.Replace('/', '\\'))) return true;

            var cleanRel = relPath.Replace('\\', '/').TrimStart('/');
            foreach (var candidate in candidateRelativePaths)
            {
                var cleanCandidate = candidate.Replace('\\', '/').TrimStart('/');
                if (cleanRel.Equals(cleanCandidate, StringComparison.OrdinalIgnoreCase)) return true;
                if (cleanRel.EndsWith("/" + cleanCandidate, StringComparison.OrdinalIgnoreCase)) return true;
                if (cleanCandidate.EndsWith("/" + cleanRel, StringComparison.OrdinalIgnoreCase)) return true;
            }

            return false;
        }

        string GetNewResourceName(string relPath, string defaultName)
        {
            foreach (var rawPath in cmd.TargetPaths.Where(p => !string.IsNullOrWhiteSpace(p)))
            {
                if (normalizedLookup.TryGetValue(rawPath, out var mappedRel))
                {
                    if (string.Equals(mappedRel, relPath, StringComparison.OrdinalIgnoreCase)
                        || string.Equals(mappedRel.Replace('\\', '/'), relPath.Replace('\\', '/'), StringComparison.OrdinalIgnoreCase))
                    {
                        var candidate = Path.GetFileNameWithoutExtension(rawPath);
                        if (!string.IsNullOrWhiteSpace(candidate))
                        {
                            return candidate;
                        }
                    }
                }
            }
            return defaultName;
        }

        var createdVersions = new List<ResourceVersionCreatedInfo>();

        var toAdd = diff
            .Added.Where(x => IsTargetMatch(x.RelativePath))
            .Select(x =>
                ResourceItem.Create(
                    cmd.RepositoryId,
                    repositoryRunnerId,
                    x.PlatformExtensionId,
                    GetNewResourceName(x.RelativePath, x.Name ?? Path.GetFileName(x.RelativePath) ?? "Unnamed"),
                    x.RelativePath,
                    x.LocalHash ?? "",
                    x.LocalFileSize ?? 0
                )
            )
            .ToList();

        if (toAdd.Count > 0)
        {
            createdVersions.AddRange(
                toAdd.Select(x => new ResourceVersionCreatedInfo(
                    x.LatestVersion!.Id,
                    x.PlatformExtensionId,
                    x.ContentId,
                    ResourcePathHelper.GetExtension(x.RelativePath),
                    x.RelativePath
                ))
            );
            dbContext.ResourceItems.AddRange(toAdd);
        }

        var pathsToFetch = diff
            .Modified.Concat(diff.Deleted)
            .Select(x => x.RelativePath)
            .Where(IsTargetMatch)
            .ToList();

        var existingItems = await dbContext
            .ResourceItems.Include(r => r.Versions)
                .ThenInclude(v => v.Locations)
            .Where(x => x.RepositoryId == cmd.RepositoryId && pathsToFetch.Contains(x.RelativePath))
            .ToDictionaryAsync(x => x.RelativePath, y => y, ct);

        var modCount = 0;
        foreach (var mod in diff.Modified.Where(x => IsTargetMatch(x.RelativePath)))
        {
            if (existingItems.TryGetValue(mod.RelativePath, out var item))
            {
                var newVersion = item.AddNewVersion(
                    repositoryRunnerId,
                    mod.LocalHash ?? "",
                    mod.LocalFileSize ?? 0,
                    cmd.Notes
                );
                dbContext.ResourceVersions.Add(newVersion);
                modCount++;
                createdVersions.Add(new ResourceVersionCreatedInfo(
                    newVersion.Id,
                    item.PlatformExtensionId,
                    item.ContentId,
                    ResourcePathHelper.GetExtension(item.RelativePath),
                    item.RelativePath
                ));
            }
        }

        var locations = existingItems
            .Where(x => diff.Deleted.Any(y => y.RelativePath == x.Key))
            .SelectMany(x => x.Value.Versions)
            .SelectMany(v => v.Locations)
            .Where(loc => loc.RepositoryRunnerId == repositoryRunnerId)
            .ToList();

        var locationRemove = 0;
        if (locations.Count > 0)
        {
            dbContext.ResourceVersionLocations.RemoveRange(locations);
            locationRemove = locations.Count;
        }

        await dbContext.SaveChangesAsync(ct);

        if (createdVersions.Count > 0)
        {
            var projectId = await dbContext.Repositories
                .AsNoTracking()
                .Where(w => w.Id == cmd.RepositoryId)
                .Select(w => w.ProjectId)
                .FirstOrDefaultAsync(ct);

            await bus.PublishAsync(
                new ResourcesCreatedEvent(
                    projectId,
                    cmd.RepositoryId,
                    cmd.RunnerId,
                    createdVersions
                )
            );
        }

        var syncedResources = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);

        void RegisterSynced(string? path, Guid vId)
        {
            if (string.IsNullOrWhiteSpace(path) || vId == Guid.Empty) return;

            syncedResources[path] = vId;
            syncedResources[path.Replace('\\', '/')] = vId;
            syncedResources[path.Replace('/', '\\')] = vId;

            if (!string.IsNullOrWhiteSpace(rootPath))
            {
                var isRooted = Path.IsPathRooted(path) || (path.Length > 2 && path[1] == ':');
                if (!isRooted)
                {
                    var cleanRel = path.TrimStart('/', '\\');
                    var fullLocalPath = Path.Combine(rootPath, cleanRel);
                    syncedResources[fullLocalPath] = vId;
                    syncedResources[fullLocalPath.Replace('\\', '/')] = vId;
                    syncedResources[fullLocalPath.Replace('/', '\\')] = vId;
                }
            }
        }

        foreach (var cv in createdVersions)
        {
            RegisterSynced(cv.RelativePath, cv.ResourceVersionId);
        }

        foreach (var item in toAdd)
        {
            var vId = item.LatestVersion?.Id ?? Guid.Empty;
            if (vId != Guid.Empty)
            {
                RegisterSynced(item.RelativePath, vId);
            }
        }

        foreach (var item in existingItems.Values)
        {
            var vId = item.LatestVersion?.Id ?? Guid.Empty;
            if (vId != Guid.Empty)
            {
                RegisterSynced(item.RelativePath, vId);
            }
        }

        var searchRelPaths = candidateRelativePaths.ToList();
        var targetItems = await dbContext.ResourceItems
            .AsNoTracking()
            .Where(x => x.RepositoryId == cmd.RepositoryId && searchRelPaths.Contains(x.RelativePath))
            .Select(x => new
            {
                x.RelativePath,
                VersionId = x.Versions.OrderByDescending(v => v.VersionNo).Select(v => v.Id).FirstOrDefault()
            })
            .ToListAsync(ct);

        foreach (var item in targetItems.Where(x => x.VersionId != Guid.Empty))
        {
            RegisterSynced(item.RelativePath, item.VersionId);
        }

        foreach (var rawPath in cmd.TargetPaths.Where(p => !string.IsNullOrWhiteSpace(p)))
        {
            if (normalizedLookup.TryGetValue(rawPath, out var relPath))
            {
                if (syncedResources.TryGetValue(relPath, out var vId))
                {
                    RegisterSynced(rawPath, vId);
                }
            }

            if (!syncedResources.ContainsKey(rawPath) && createdVersions.Count == 1)
            {
                RegisterSynced(rawPath, createdVersions[0].ResourceVersionId);
            }
        }

        var versionIds = createdVersions.Select(x => x.ResourceVersionId).ToList();
        if (versionIds.Count == 0 && syncedResources.Count > 0)
        {
            versionIds = syncedResources.Values.Distinct().ToList();
        }

        return Result.Ok(
            new SyncLocalChangesResultDto(
                cmd.RepositoryId,
                cmd.RunnerId,
                toAdd.Count,
                modCount,
                locationRemove,
                versionIds,
                syncedResources
            )
        );
    }

    private static string ToRelativePath(string path, string? rootPath)
    {
        if (string.IsNullOrWhiteSpace(path)) return string.Empty;

        var trimmed = path.Trim();
        if (!string.IsNullOrWhiteSpace(rootPath))
        {
            var normPath = trimmed.Replace('\\', '/').TrimEnd('/');
            var normRoot = rootPath.Replace('\\', '/').TrimEnd('/');

            if (normPath.StartsWith(normRoot, StringComparison.OrdinalIgnoreCase))
            {
                var sub = normPath.Substring(normRoot.Length).TrimStart('/');
                return sub;
            }

            try
            {
                if (Path.IsPathRooted(trimmed))
                {
                    var rel = Path.GetRelativePath(rootPath, trimmed).Replace('\\', '/').Trim('/');
                    if (!rel.StartsWith("../") && !rel.StartsWith("..\\") && rel != "..")
                    {
                        return rel;
                    }
                }
            }
            catch
            {
            }
        }

        return trimmed.Replace('\\', '/').TrimStart('/');
    }
}
