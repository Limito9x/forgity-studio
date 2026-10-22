using Automation.Content.Contracts;
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
        var contentType = await db.ContentTypes
            .FirstOrDefaultAsync(c => c.ProjectId == projectId &&
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
}
