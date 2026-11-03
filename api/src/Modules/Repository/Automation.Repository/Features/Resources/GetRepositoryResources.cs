using Automation.Content.Contracts;
using Automation.Files.Contracts;
using Automation.SharedKernel.Abstractions.Querying;
using Automation.SharedKernel.Infrastructure.Querying;
using Automation.Repository.Constants;
using Automation.Repository.Domain.Entities;
using Automation.Repository.Features.Repositories;
using Automation.Repository.Infrastructure.Persistence;
using Automation.Repository.Shared.Dtos;
using Automation.Runner.Contracts;
using Gridify;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Repository.Features.Resources;

public class GetRepositoryResourcesQuery : PagedQuery
{
    public Guid RepositoryId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid WorkspaceId { get => RepositoryId; set => RepositoryId = value; }
    public Guid? RunnerId { get; set; }
    public Guid? RepositoryRunnerId { get; set; }
    public Guid? ContentId { get; set; }
    public bool? IsLinked { get; set; }
}

public class GetRepositoryResourcesEndpoint(IMessageBus bus)
    : Endpoint<GetRepositoryResourcesQuery, PagedResult<WorkspaceResourceDto>>
{
    public override void Configure()
    {
        Get("{repositoryId:guid}/resources");
        Group<RepositoriesGroup>();
        Permissions(P.Resource.GetAll);
        Description(x => x.WithName("GetRepositoryResources"));
    }

    public override async Task HandleAsync(GetRepositoryResourcesQuery req, CancellationToken ct)
    {
        var repositoryId = Route<Guid>("repositoryId");
        var projectId = Query<Guid>("projectId");
        var runnerId = Query<Guid?>("runnerId", isRequired: false);
        var repositoryRunnerId = Query<Guid?>("repositoryRunnerId", isRequired: false);
        var contentId = Query<Guid?>("contentId", isRequired: false);
        var isLinked = Query<bool?>("isLinked", isRequired: false);

        req.RepositoryId = repositoryId;
        req.ProjectId = projectId;
        req.RunnerId = runnerId;
        req.RepositoryRunnerId = repositoryRunnerId;
        req.ContentId = contentId;
        req.IsLinked = isLinked;

        var result = await bus.InvokeAsync<Result<PagedResult<WorkspaceResourceDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetRepositoryResourcesHandler(
    RepositoryDbContext db,
    IContentApi contentApi,
    IRunnerApi runnerApi,
    IAssetApi? assetApi = null
)
{
    public async Task<Result<PagedResult<WorkspaceResourceDto>>> HandleAsync(
        GetRepositoryResourcesQuery query,
        CancellationToken ct
    )
    {
        var baseQuery = db
            .ResourceItems.AsNoTracking()
            .Where(r => r.RepositoryId == query.RepositoryId);

        // Lọc theo Workstation Root cụ thể nếu có
        if (query.RepositoryRunnerId.HasValue)
        {
            baseQuery = baseQuery.Where(r => r.Versions.Any(v =>
                v.Locations.Any(l => l.RepositoryRunnerId == query.RepositoryRunnerId.Value)));
        }
        else if (query.RunnerId.HasValue)
        {
            baseQuery = baseQuery.Where(r => r.Versions.Any(v =>
                v.Locations.Any(l => l.RepositoryRunner.RunnerId == query.RunnerId.Value)));
        }

        // 1. Lấy Map Content của Project (Single-pass)
        var contentMap = new Dictionary<Guid, ContentSummaryDto>();
        var contentResult = await contentApi.GetContentsByProjectIdAsync(query.ProjectId, ct);
        if (contentResult.IsSuccess && contentResult.Value != null)
        {
            contentMap = new Dictionary<Guid, ContentSummaryDto>(contentResult.Value);
        }

        // 1.1. Lọc theo ContentId cụ thể hoặc trạng thái gán (IsLinked) nếu có
        if (query.ContentId.HasValue && query.ContentId.Value != Guid.Empty)
        {
            var linkedRes = await contentApi.GetLinkedResourceIdsByContentIdAsync(query.ContentId.Value, ct);
            var linkedIds = linkedRes.IsSuccess && linkedRes.Value != null ? linkedRes.Value : [];
            baseQuery = baseQuery.Where(r => linkedIds.Contains(r.Id));
        }
        else if (query.IsLinked.HasValue)
        {
            var allLinkedRes = await contentApi.GetAllLinkedResourceIdsInProjectAsync(query.ProjectId, ct);
            var allLinkedIds = allLinkedRes.IsSuccess && allLinkedRes.Value != null ? allLinkedRes.Value : [];
            if (query.IsLinked.Value)
            {
                baseQuery = baseQuery.Where(r => allLinkedIds.Contains(r.Id));
            }
            else
            {
                baseQuery = baseQuery.Where(r => !allLinkedIds.Contains(r.Id));
            }
        }

        // 2. Xử lý Omni-Search nếu có từ khóa
        if (!string.IsNullOrWhiteSpace(query.GlobalKeyword))
        {
            var kw = query.GlobalKeyword.Trim();
            var matchedContentIds = contentMap
                .Where(c =>
                    c.Value.Name.Contains(kw, StringComparison.OrdinalIgnoreCase)
                    || c.Value.ContentTypeName.Contains(kw, StringComparison.OrdinalIgnoreCase)
                )
                .Select(c => c.Key)
                .ToList();

            var matchedResourceIds = new List<Guid>();
            foreach (var cId in matchedContentIds)
            {
                var rRes = await contentApi.GetLinkedResourceIdsByContentIdAsync(cId, ct);
                if (rRes.IsSuccess && rRes.Value.Count > 0)
                {
                    matchedResourceIds.AddRange(rRes.Value);
                }
            }

            baseQuery = baseQuery.Where(r =>
                EF.Functions.ILike(r.DisplayName, $"%{kw}%")
                || EF.Functions.ILike(r.RelativePath, $"%{kw}%")
                || (matchedResourceIds.Count > 0 && matchedResourceIds.Contains(r.Id))
            );
        }

        // 3. Gridify Phân trang & Sắp xếp trên SQL
        var mapper = new GridifyMapper<ResourceItem>()
            .GenerateMappings()
            .AddMap("displayName", r => r.DisplayName)
            .AddMap("relativePath", r => r.RelativePath)
            .AddMap("createdAt", r => r.CreatedAt);

        var pagedResult = await baseQuery.ToPagedResultAsync(query, mapper, ct);
        if (pagedResult.IsFailed)
        {
            return pagedResult.ToResult();
        }

        // 3.1. Lấy thông tin Content Anchor Links cho các resource trong trang hiện tại
        var pageResourceIds = pagedResult.Value.Items.Select(r => r.Id).ToList();
        var anchorLinksMap = new Dictionary<Guid, IReadOnlyList<ContentAnchorLinkDto>>();
        if (pageResourceIds.Count > 0)
        {
            var anchorResult = await contentApi.GetResourceAnchorLinksAsync(pageResourceIds, ct);
            if (anchorResult.IsSuccess && anchorResult.Value != null)
            {
                anchorLinksMap = new Dictionary<Guid, IReadOnlyList<ContentAnchorLinkDto>>(anchorResult.Value);
            }
        }

        // 3.2. Query Versions cho các resource trong trang hiện tại (CHỈ SELECT các trường cần thiết, TUYỆT ĐỐI KHÔNG SELECT Metadata JSON)
        var versionSummaries = pageResourceIds.Count > 0
            ? await db.ResourceVersions.AsNoTracking()
                .Where(v => pageResourceIds.Contains(v.ResourceId))
                .Select(v => new
                {
                    v.Id,
                    v.ResourceId,
                    v.VersionNo,
                    v.Status,
                    Locations = v.Locations.Select(l => new
                    {
                        l.IsOrigin,
                        l.DiscoveredAt,
                        RunnerId = l.RepositoryRunner != null ? (Guid?)l.RepositoryRunner.RunnerId : null
                    }).ToList()
                })
                .ToListAsync(ct)
            : [];

        var versionsByResource = versionSummaries
            .GroupBy(v => v.ResourceId)
            .ToDictionary(g => g.Key, g => g.ToList());

        // Lấy thông tin Runner cho các resource đang bị lock và các resource có holding location
        var lockedRunnerIds = pagedResult.Value.Items
            .Where(r => r.IsLocked && r.LockedByRunnerId.HasValue)
            .Select(r => r.LockedByRunnerId!.Value);

        var holdingRunnerIdMap = new Dictionary<Guid, Guid>();
        var latestVersionIdStrings = new List<string>();

        foreach (var resourceId in pageResourceIds)
        {
            if (versionsByResource.TryGetValue(resourceId, out var vers))
            {
                var latestVer = vers.OrderByDescending(v => v.VersionNo).FirstOrDefault();
                if (latestVer != null)
                {
                    latestVersionIdStrings.Add(latestVer.Id.ToString());
                    var holdingLocation = latestVer.Locations
                        .OrderByDescending(l => l.IsOrigin)
                        .ThenByDescending(l => l.DiscoveredAt)
                        .FirstOrDefault();

                    if (holdingLocation?.RunnerId is { } rId)
                    {
                        holdingRunnerIdMap[resourceId] = rId;
                    }
                }
            }
        }

        var allNeededRunnerIds = lockedRunnerIds
            .Concat(holdingRunnerIdMap.Values)
            .Distinct()
            .ToList();

        IReadOnlyDictionary<Guid, RunnerDto> runnerMap = new Dictionary<Guid, RunnerDto>();
        if (allNeededRunnerIds.Count > 0)
        {
            var runnerMapResult = await runnerApi.GetAgentsMapByIdsAsync(allNeededRunnerIds, ct);
            if (runnerMapResult.IsSuccess && runnerMapResult.Value != null)
            {
                runnerMap = runnerMapResult.Value;
            }
        }

        // 3.3. Batch query Thumbnail URLs từ Module Files (Slot: Thumbnail)
        var thumbnailUrlMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (latestVersionIdStrings.Count > 0 && assetApi != null)
        {
            var thumbRes = await assetApi.GetFilesAsync(
                latestVersionIdStrings,
                "ResourceVersion",
                ResourceAssetSlots.Thumbnail,
                ct
            );
            if (thumbRes.IsSuccess && thumbRes.Value != null)
            {
                foreach (var (verIdStr, links) in thumbRes.Value)
                {
                    var firstThumb = links.FirstOrDefault();
                    if (firstThumb != null && !string.IsNullOrEmpty(firstThumb.PublicUrl))
                    {
                        thumbnailUrlMap[verIdStr] = firstThumb.PublicUrl;
                    }
                }
            }
        }

        // 4. Enrich dữ liệu Content, Lock, Holding Runner và Thumbnail từ Map vào DTO
        var dtos = pagedResult
            .Value.Items.Select(r =>
            {
                var holdingRunnerId = holdingRunnerIdMap.TryGetValue(r.Id, out var hid) ? (Guid?)hid : null;
                var holdingRunnerName = holdingRunnerId != null && runnerMap.TryGetValue(holdingRunnerId.Value, out var hr) ? hr.Name : null;

                anchorLinksMap.TryGetValue(r.Id, out var links);
                var primaryLink = links?.FirstOrDefault();
                var contentId = primaryLink?.ContentItemId;
                var contentName = primaryLink?.ContentItemName;
                var anchorPath = primaryLink?.AnchorPath;

                var linkedAnchors = links?.Select(l =>
                {
                    contentMap.TryGetValue(l.ContentItemId, out var cInfo);
                    return new ResourceLinkedAnchorDto(
                        ContentItemId: l.ContentItemId,
                        ContentItemName: l.ContentItemName,
                        ContentTypeName: cInfo?.ContentTypeName,
                        ContentTypeColor: cInfo?.ContentTypeColor,
                        ContentTypeIcon: cInfo?.ContentTypeIcon,
                        AnchorPath: l.AnchorPath
                    );
                }).ToList() ?? (IReadOnlyList<ResourceLinkedAnchorDto>)[];

                versionsByResource.TryGetValue(r.Id, out var vers);
                var versionCount = vers?.Count ?? 0;
                var latestVersion = vers?.OrderByDescending(v => v.VersionNo).FirstOrDefault();
                var latestVerId = latestVersion?.Id;
                var thumbUrl = latestVerId.HasValue && thumbnailUrlMap.TryGetValue(latestVerId.Value.ToString(), out var tUrl)
                    ? tUrl
                    : null;

                return new WorkspaceResourceDto(
                    Id: r.Id,
                    WorkspaceId: r.RepositoryId,
                    DisplayName: r.DisplayName,
                    RelativePath: r.RelativePath,
                    Extension: r.Extension,
                    ContentId: contentId,
                    ContentName: contentName,
                    ContentTypeName: contentId != null && contentMap.TryGetValue(contentId.Value, out var c2) ? c2.ContentTypeName : null,
                    ContentTypeColor: contentId != null && contentMap.TryGetValue(contentId.Value, out var c3) ? c3.ContentTypeColor : null,
                    ContentTypeIcon: contentId != null && contentMap.TryGetValue(contentId.Value, out var c4) ? c4.ContentTypeIcon : null,
                    VersionCount: versionCount,
                    CreatedAt: r.CreatedAt,
                    LatestVersionId: latestVerId,
                    LatestVersionNo: latestVersion?.VersionNo,
                    LatestVersionStatus: latestVersion?.Status,
                    IsLocked: r.IsLocked,
                    LockedByRunnerId: r.LockedByRunnerId,
                    LockedByRunnerName: r.LockedByRunnerId != null && runnerMap.TryGetValue(r.LockedByRunnerId.Value, out var rn) ? rn.Name : null,
                    LockedAt: r.LockedAt,
                    HoldingRunnerId: holdingRunnerId,
                    HoldingRunnerName: holdingRunnerName,
                    AnchorPath: anchorPath,
                    LinkedAnchors: linkedAnchors,
                    ThumbnailUrl: thumbUrl
                );
            })
            .ToList();

        return Result.Ok(
            PagedResult<WorkspaceResourceDto>.From(
                dtos,
                pagedResult.Value.TotalCount,
                pagedResult.Value.Page,
                pagedResult.Value.PageSize
            )
        );
    }
}
