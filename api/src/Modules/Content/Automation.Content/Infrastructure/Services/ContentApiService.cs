using Automation.Content.Contracts;
using Automation.Content.Domain.Enums;
using Automation.Content.Infrastructure.Persistence;
using Automation.SharedKernel.Extensions.Strings;
using FluentResults;
using Microsoft.EntityFrameworkCore;

namespace Automation.Content.Infrastructure.Services;

public class ContentApiService(ContentDbContext db) : IContentApi
{
    public async Task<Result<IReadOnlyDictionary<Guid, ContentSummaryDto>>> GetContentsByProjectIdAsync(
        Guid projectId, 
        CancellationToken ct = default)
    {
        var items = await db.ContentItems
            .AsNoTracking()
            .Where(c => c.ProjectId == projectId)
            .Select(c => new ContentSummaryDto(
                c.Id,
                c.Name,
                c.ContentTypeId,
                c.ContentType.Name,
                c.ContentType.Color,
                c.ContentType.Icon
            ))
            .ToListAsync(ct);

        var map = items.ToDictionary(x => x.Id);
        return Result.Ok<IReadOnlyDictionary<Guid, ContentSummaryDto>>(map);
    }

    public async Task<Result<ContentSummaryDto>> GetContentByIdAsync(
        Guid contentId, 
        CancellationToken ct = default)
    {
        var item = await db.ContentItems
            .AsNoTracking()
            .Where(c => c.Id == contentId)
            .Select(c => new ContentSummaryDto(
                c.Id,
                c.Name,
                c.ContentTypeId,
                c.ContentType.Name,
                c.ContentType.Color,
                c.ContentType.Icon
            ))
            .FirstOrDefaultAsync(ct);

        if (item == null)
        {
            return Result.Fail<ContentSummaryDto>($"Content item with ID '{contentId}' not found.");
        }

        return Result.Ok(item);
    }

    public async Task<Result<IReadOnlyDictionary<Guid, ContentSummaryDto>>> GetContentsByIdsAsync(
        IEnumerable<Guid> contentIds, 
        CancellationToken ct = default)
    {
        var idsList = contentIds.Distinct().ToList();
        var items = await db.ContentItems
            .AsNoTracking()
            .Where(c => idsList.Contains(c.Id))
            .Select(c => new ContentSummaryDto(
                c.Id,
                c.Name,
                c.ContentTypeId,
                c.ContentType.Name,
                c.ContentType.Color,
                c.ContentType.Icon
            ))
            .ToListAsync(ct);

        var map = items.ToDictionary(x => x.Id);
        return Result.Ok<IReadOnlyDictionary<Guid, ContentSummaryDto>>(map);
    }

    public async Task<Result<ContentSummaryDto>> GetOrCreateContentItemAsync(
        Guid projectId,
        string contentTypeKeyOrName,
        string contentItemName,
        bool createIfNotExists,
        CancellationToken ct = default)
    {
        if (projectId == Guid.Empty)
        {
            return Result.Fail<ContentSummaryDto>("ProjectId cannot be empty.");
        }

        if (string.IsNullOrWhiteSpace(contentTypeKeyOrName))
        {
            return Result.Fail<ContentSummaryDto>("ContentType is required.");
        }

        if (string.IsNullOrWhiteSpace(contentItemName))
        {
            return Result.Fail<ContentSummaryDto>("ContentName is required.");
        }

        var ctQuery = contentTypeKeyOrName.Trim();
        var isGuid = Guid.TryParse(ctQuery, out var parsedCtId);
        var contentType = isGuid
            ? await db.ContentTypes.FirstOrDefaultAsync(c => c.ProjectId == projectId && c.Id == parsedCtId, ct)
            : await db.ContentTypes.FirstOrDefaultAsync(c => c.ProjectId == projectId &&
                (c.Key.ToLower() == ctQuery.ToLower() ||
                 c.Name.ToLower() == ctQuery.ToLower() ||
                 c.DisplayName.ToLower() == ctQuery.ToLower()), ct);

        if (contentType == null)
        {
            return Result.Fail<ContentSummaryDto>($"ContentType '{contentTypeKeyOrName}' not found in project.");
        }

        var trimmedName = contentItemName.Trim();
        var itemSlug = trimmedName.ToSlug();

        var existingItem = await db.ContentItems
            .Include(c => c.ContentType)
            .FirstOrDefaultAsync(c => c.ProjectId == projectId &&
                c.ContentTypeId == contentType.Id &&
                (c.Name.ToLower() == trimmedName.ToLower() ||
                 (!string.IsNullOrEmpty(itemSlug) && c.Key.ToLower() == itemSlug.ToLower())), ct);

        if (existingItem != null)
        {
            return Result.Ok(new ContentSummaryDto(
                existingItem.Id,
                existingItem.Name,
                existingItem.ContentTypeId,
                existingItem.ContentType?.Name ?? contentType.Name,
                existingItem.ContentType?.Color ?? contentType.Color,
                existingItem.ContentType?.Icon ?? contentType.Icon
            ));
        }

        if (!createIfNotExists)
        {
            return Result.Fail<ContentSummaryDto>(
                $"Content item '{contentItemName}' does not exist in type '{contentType.Name}', and 'Create If Not Exists' is disabled."
            );
        }

        var safeKey = string.IsNullOrWhiteSpace(itemSlug)
            ? $"item-{Guid.NewGuid():N}"[..12]
            : itemSlug;

        // Ensure key uniqueness within project and content type
        var keyExists = await db.ContentItems
            .AnyAsync(c => c.ProjectId == projectId && c.ContentTypeId == contentType.Id && c.Key == safeKey, ct);
        if (keyExists)
        {
            safeKey = $"{safeKey}-{Guid.NewGuid():N}"[..Math.Min(safeKey.Length + 9, 50)];
        }

        var newItem = new Automation.Content.Domain.Entities.ContentItem(
            contentType.Id,
            projectId,
            trimmedName,
            safeKey
        );

        db.ContentItems.Add(newItem);
        await db.SaveChangesAsync(ct);

        return Result.Ok(new ContentSummaryDto(
            newItem.Id,
            newItem.Name,
            contentType.Id,
            contentType.Name,
            contentType.Color,
            contentType.Icon
        ));
    }

    public async Task<Result<IReadOnlyList<ContentAnchorLinkDto>>> SmartLinkResourcesByConventionAsync(
        Guid projectId,
        string contentTypeKeyOrName,
        IEnumerable<ResourceSmartLinkInput> resources,
        CancellationToken ct = default
    )
    {
        var inputList = resources?.ToList() ?? [];
        if (inputList.Count == 0)
        {
            return Result.Ok<IReadOnlyList<ContentAnchorLinkDto>>([]);
        }

        var results = new List<ContentAnchorLinkDto>();
        var contentCache = new Dictionary<string, ContentSummaryDto>(StringComparer.OrdinalIgnoreCase);

        foreach (var res in inputList)
        {
            var parseResult = AnchorConventionParser.Parse(res.FileName);
            var contentName = parseResult.ContentName;
            var anchorPath = string.IsNullOrWhiteSpace(res.ExplicitAnchorPath) 
                ? parseResult.AnchorPath 
                : res.ExplicitAnchorPath.Trim();

            if (string.IsNullOrWhiteSpace(contentName))
            {
                continue;
            }

            if (!contentCache.TryGetValue(contentName, out var contentItem))
            {
                var getOrCreateRes = await GetOrCreateContentItemAsync(
                    projectId,
                    contentTypeKeyOrName,
                    contentName,
                    createIfNotExists: true,
                    ct
                );

                if (getOrCreateRes.IsFailed || getOrCreateRes.Value == null)
                {
                    return Result.Fail<IReadOnlyList<ContentAnchorLinkDto>>(getOrCreateRes.Errors);
                }

                contentItem = getOrCreateRes.Value;
                contentCache[contentName] = contentItem;
            }

            var existingLink = await db.ContentAnchorLinks
                .FirstOrDefaultAsync(l => 
                    l.ContentItemId == contentItem.Id && 
                    l.TargetId == res.ResourceId && 
                    l.TargetType == Domain.Enums.ContentLinkTargetType.Resource, ct);

            if (existingLink != null)
            {
                existingLink.AnchorPath = anchorPath;
                if (!string.IsNullOrWhiteSpace(res.MetadataJson))
                {
                    existingLink.MetadataJson = res.MetadataJson;
                }
                results.Add(new ContentAnchorLinkDto(
                    existingLink.Id,
                    contentItem.Id,
                    contentItem.Name,
                    existingLink.AnchorPath,
                    (int)existingLink.TargetType,
                    existingLink.TargetId,
                    res.FileName,
                    existingLink.MetadataJson
                ));
            }
            else
            {
                var newLink = new Domain.Entities.ContentAnchorLink(
                    projectId,
                    contentItem.Id,
                    anchorPath,
                    Domain.Enums.ContentLinkTargetType.Resource,
                    res.ResourceId,
                    res.MetadataJson
                );
                db.ContentAnchorLinks.Add(newLink);
                results.Add(new ContentAnchorLinkDto(
                    newLink.Id,
                    contentItem.Id,
                    contentItem.Name,
                    newLink.AnchorPath,
                    (int)newLink.TargetType,
                    newLink.TargetId,
                    res.FileName,
                    newLink.MetadataJson
                ));
            }
        }

        await db.SaveChangesAsync(ct);
        return Result.Ok<IReadOnlyList<ContentAnchorLinkDto>>(results);
    }

    public async Task<Result<IReadOnlyList<ContentAnchorLinkDto>>> AssignResourcesToAnchorAsync(
        Guid projectId,
        Guid contentItemId,
        string? anchorPath,
        IEnumerable<ResourceSmartLinkInput> resources,
        CancellationToken ct = default
    )
    {
        var contentItem = await db.ContentItems.FirstOrDefaultAsync(c => c.Id == contentItemId, ct);
        if (contentItem == null)
        {
            return Result.Fail<IReadOnlyList<ContentAnchorLinkDto>>($"Content item with ID '{contentItemId}' not found.");
        }

        var inputList = resources?.ToList() ?? [];
        var results = new List<ContentAnchorLinkDto>();

        foreach (var res in inputList)
        {
            var targetPath = !string.IsNullOrWhiteSpace(res.ExplicitAnchorPath)
                ? res.ExplicitAnchorPath.Trim()
                : !string.IsNullOrWhiteSpace(anchorPath)
                    ? anchorPath.Trim()
                    : AnchorConventionParser.Parse(res.FileName).AnchorPath;

            var existingLink = await db.ContentAnchorLinks
                .FirstOrDefaultAsync(l => 
                    l.ContentItemId == contentItemId && 
                    l.TargetId == res.ResourceId && 
                    l.TargetType == Domain.Enums.ContentLinkTargetType.Resource, ct);

            if (existingLink != null)
            {
                existingLink.AnchorPath = targetPath;
                if (!string.IsNullOrWhiteSpace(res.MetadataJson))
                {
                    existingLink.MetadataJson = res.MetadataJson;
                }
                results.Add(new ContentAnchorLinkDto(
                    existingLink.Id,
                    contentItem.Id,
                    contentItem.Name,
                    existingLink.AnchorPath,
                    (int)existingLink.TargetType,
                    existingLink.TargetId,
                    res.FileName,
                    existingLink.MetadataJson
                ));
            }
            else
            {
                var newLink = new Domain.Entities.ContentAnchorLink(
                    projectId,
                    contentItemId,
                    targetPath,
                    Domain.Enums.ContentLinkTargetType.Resource,
                    res.ResourceId,
                    res.MetadataJson
                );
                db.ContentAnchorLinks.Add(newLink);
                results.Add(new ContentAnchorLinkDto(
                    newLink.Id,
                    contentItem.Id,
                    contentItem.Name,
                    newLink.AnchorPath,
                    (int)newLink.TargetType,
                    newLink.TargetId,
                    res.FileName,
                    newLink.MetadataJson
                ));
            }
        }

        await db.SaveChangesAsync(ct);
        return Result.Ok<IReadOnlyList<ContentAnchorLinkDto>>(results);
    }

    public async Task<Result> UnlinkResourcesAsync(
        IEnumerable<Guid> resourceIds,
        Guid? contentItemId = null,
        CancellationToken ct = default
    )
    {
        var idList = resourceIds?.Distinct().ToList() ?? [];
        if (idList.Count == 0)
        {
            return Result.Ok();
        }

        var query = db.ContentAnchorLinks
            .Where(l => l.TargetType == Domain.Enums.ContentLinkTargetType.Resource && idList.Contains(l.TargetId));

        if (contentItemId.HasValue && contentItemId.Value != Guid.Empty)
        {
            query = query.Where(l => l.ContentItemId == contentItemId.Value);
        }

        var linksToRemove = await query.ToListAsync(ct);
        if (linksToRemove.Count > 0)
        {
            db.ContentAnchorLinks.RemoveRange(linksToRemove);
            await db.SaveChangesAsync(ct);
        }

        return Result.Ok();
    }

    public async Task<Result<IReadOnlyDictionary<Guid, IReadOnlyList<ContentAnchorLinkDto>>>> GetResourceAnchorLinksAsync(
        IEnumerable<Guid> resourceIds,
        CancellationToken ct = default
    )
    {
        var idList = resourceIds?.Distinct().ToList() ?? [];
        if (idList.Count == 0)
        {
            return Result.Ok<IReadOnlyDictionary<Guid, IReadOnlyList<ContentAnchorLinkDto>>>(
                new Dictionary<Guid, IReadOnlyList<ContentAnchorLinkDto>>()
            );
        }

        var links = await db.ContentAnchorLinks
            .AsNoTracking()
            .Include(l => l.ContentItem)
            .Where(l => l.TargetType == Domain.Enums.ContentLinkTargetType.Resource && idList.Contains(l.TargetId))
            .Select(l => new ContentAnchorLinkDto(
                l.Id,
                l.ContentItemId,
                l.ContentItem.Name,
                l.AnchorPath,
                (int)l.TargetType,
                l.TargetId,
                null,
                l.MetadataJson
            ))
            .ToListAsync(ct);

        var grouped = links
            .GroupBy(l => l.TargetId)
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<ContentAnchorLinkDto>)g.ToList()
            );

        return Result.Ok<IReadOnlyDictionary<Guid, IReadOnlyList<ContentAnchorLinkDto>>>(grouped);
    }

    public async Task<Result<ContentAnchorTreeDto>> GetContentAnchorTreeAsync(
        Guid contentItemId,
        CancellationToken ct = default
    )
    {
        var contentItem = await db.ContentItems
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == contentItemId, ct);

        if (contentItem == null)
        {
            return Result.Fail<ContentAnchorTreeDto>($"Content item with ID '{contentItemId}' not found.");
        }

        var links = await db.ContentAnchorLinks
            .AsNoTracking()
            .Where(l => l.ContentItemId == contentItemId)
            .ToListAsync(ct);

        var roots = new List<ContentAnchorNodeDto>();

        foreach (var link in links)
        {
            var segments = link.AnchorPath.Split('/', StringSplitOptions.RemoveEmptyEntries);
            if (segments.Length == 0) continue;

            List<ContentAnchorNodeDto> currentChildren = roots;
            string currentPath = "";

            for (int i = 0; i < segments.Length; i++)
            {
                var seg = segments[i];
                currentPath = string.IsNullOrEmpty(currentPath) ? seg : $"{currentPath}/{seg}";
                var isLeaf = (i == segments.Length - 1);

                var existingNode = currentChildren.FirstOrDefault(n => n.Name.Equals(seg, StringComparison.OrdinalIgnoreCase));
                if (existingNode == null)
                {
                    existingNode = new ContentAnchorNodeDto(
                        seg,
                        currentPath,
                        isLeaf,
                        isLeaf ? link.TargetId : null,
                        isLeaf ? (int)link.TargetType : null,
                        isLeaf ? seg : null,
                        isLeaf ? link.MetadataJson : null,
                        new List<ContentAnchorNodeDto>()
                    );
                    currentChildren.Add(existingNode);
                }

                currentChildren = existingNode.Children;
            }
        }

        return Result.Ok(new ContentAnchorTreeDto(contentItem.Id, contentItem.Name, roots));
    }

    public async Task<Result<IReadOnlyList<Guid>>> GetLinkedResourceIdsByContentIdAsync(
        Guid contentItemId,
        CancellationToken ct = default
    )
    {
        var resourceIds = await db.ContentAnchorLinks
            .AsNoTracking()
            .Where(l => l.ContentItemId == contentItemId && l.TargetType == ContentLinkTargetType.Resource)
            .Select(l => l.TargetId)
            .Distinct()
            .ToListAsync(ct);

        return Result.Ok<IReadOnlyList<Guid>>(resourceIds);
    }
}
