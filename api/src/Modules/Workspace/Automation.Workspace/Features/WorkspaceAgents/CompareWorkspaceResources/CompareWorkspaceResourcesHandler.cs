using Automation.Platform.Contracts;
using Automation.Runner.Contracts;
using Automation.Workspace.Infrastructure.Persistence;
using Automation.Workspace.Shared.Dtos;
using Automation.Workspace.Shared.Helpers;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Workspace.Features.WorkspaceAgents.CompareWorkspaceResources;

[NonTransactional]
public class CompareWorkspaceResourcesHandler(
    WorkspaceDbContext dbContext,
    IRunnerApi agentApi,
    IPlatformApi platformApi
)
{
    public async Task<Result<DiffResult>> HandleAsync(
        CompareWorkspaceResourcesCommand command,
        CancellationToken ct
    )
    {
        var workspaceAgent = await dbContext.WorkspaceAgents.FirstOrDefaultAsync(
            x => x.AgentId == command.AgentId && x.WorkspaceId == command.WorkspaceId,
            ct
        );

        if (workspaceAgent == null)
        {
            return Result.Fail("WorkspaceAgent not found");
        }

        var platformIds = await dbContext
            .WorkspacePlatforms.Where(x => x.WorkspaceId == command.WorkspaceId)
            .Select(x => x.PlatformId)
            .ToListAsync(ct);

        var platformResult = await platformApi.GetExtensionMapAsync(
            platformIds: platformIds,
            ct: ct
        );

        var platformExtensionMap = platformResult.Value;

        var extensions = platformExtensionMap.Values.Select(x => x.ToString()).ToHashSet();

        // Tìm các file có trong thư mục của agent tại workspace này
        var scanResult = await agentApi.SendScanCommandAsync(
            command.AgentId,
            workspaceAgent.RootPath,
            platformExtensionMap.Keys,
            ct
        );

        var files = scanResult.Value?.Items ?? [];

        // Tạo một dict để tra cứu nhanh
        var fileDictionary = files.ToDictionary(x => x.RelativePath, y => y);

        // Lấy các tài nguyên đã có trong workspace agent (dữ liệu DB)
        var resourceDictionary = await dbContext
            .ResourceItems.Include(r => r.Versions)
                .ThenInclude(v => v.Locations)
            .Where(r => r.WorkspaceId == command.WorkspaceId)
            .ToDictionaryAsync(r => r.RelativePath, y => y, ct);

        // Tính tập hợp từ db và file path của agent
        var allRelativePaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        allRelativePaths.UnionWith(fileDictionary.Keys);
        allRelativePaths.UnionWith(resourceDictionary.Keys);

        var added = new List<ResourceDiffItem>();
        var modified = new List<ResourceDiffItem>();
        var deleted = new List<ResourceDiffItem>();
        var missing = new List<ResourceDiffItem>();

        foreach (var filePath in allRelativePaths)
        {
            var agentFile = fileDictionary.GetValueOrDefault(filePath);
            var resource = resourceDictionary.GetValueOrDefault(filePath);

            var ext = ResourcePathHelper.GetExtension(filePath);
            var extId = platformExtensionMap.GetValueOrDefault(ext);

            // TH1: File mới (có trong agent nhưng không có trong worksspace)
            if (agentFile != null && resource == null)
            {
                var smartName = ResourcePathHelper.GetSmartDisplayName(agentFile.RelativePath);

                added.Add(
                    new ResourceDiffItem(
                        filePath,
                        smartName,
                        agentFile.Hash,
                        agentFile.SizeBytes,
                        extId,
                        null
                    )
                );
            }

            // TH2: Chỉnh sửa (vừa có trong agent và có trong db)
            if (agentFile != null && resource != null)
            {
                var latestVersion = resource.LatestVersion;
                if (latestVersion!.FileHash != agentFile.Hash)
                {
                    latestVersion = resource.LatestVersion;

                    if (latestVersion == null)
                        throw new InvalidOperationException("Resource has no version");

                    modified.Add(
                        new ResourceDiffItem(
                            filePath,
                            resource.DisplayName,
                            agentFile.Hash,
                            agentFile.SizeBytes,
                            extId,
                            new ResourceVersionDto(
                                latestVersion.Id,
                                latestVersion.VersionNo,
                                latestVersion.SizeBytes,
                                latestVersion.FileHash!,
                                latestVersion.Notes,
                                latestVersion.CreatedAt
                            )
                        )
                    );
                }
            }

            /*
             * Không có ở agent nhưng có ở resource
             *
             */
            if (agentFile == null && resource != null)
            {
                // Có tồn tại lịch sử trên agent đang scan -> Xóa
                if (resource.HasOnLocal(workspaceAgent.Id))
                {
                    var latestVersion =
                        resource.LatestVersion
                        ?? throw new InvalidOperationException("Resource has no version");

                    deleted.Add(
                        new ResourceDiffItem(
                            filePath,
                            resource.DisplayName,
                            null,
                            0,
                            extId,
                            new ResourceVersionDto(
                                latestVersion.Id,
                                latestVersion.VersionNo,
                                latestVersion.SizeBytes,
                                latestVersion.FileHash,
                                latestVersion.Notes,
                                latestVersion.CreatedAt
                            )
                        )
                    );
                }
                // Ngược lại chưa có trên agent -> còn thiếu và có thể pull về
                else
                {
                    missing.Add(
                        new ResourceDiffItem(
                            filePath,
                            resource.DisplayName,
                            null,
                            0,
                            extId,
                            new ResourceVersionDto(
                                resource.LatestVersion!.Id,
                                resource.LatestVersion.VersionNo,
                                resource.LatestVersion.SizeBytes,
                                resource.LatestVersion.FileHash,
                                resource.LatestVersion.Notes,
                                resource.LatestVersion.CreatedAt
                            )
                        )
                    );
                }
            }
        }

        return Result.Ok(new DiffResult(workspaceAgent.Id, added, modified, deleted, missing));
    }
}
