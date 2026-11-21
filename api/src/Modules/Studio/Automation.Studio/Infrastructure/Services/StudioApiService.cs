using Automation.Studio.Contracts;
using Automation.Studio.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Automation.Studio.Infrastructure.Services;

public class StudioApiService(StudioDbContext db) : IStudioApi, IProjectsApi
{
    public async Task<Guid?> GetProjectStorageProfileIdAsync(Guid projectId, CancellationToken ct = default)
    {
        return await db.Projects
            .AsNoTracking()
            .Where(p => p.Id == projectId)
            .Select(p => p.StorageProfileId)
            .FirstOrDefaultAsync(ct);
    }

    public async Task<Result<StudioQuotaDto>> GetStudioQuotaAsync(Guid studioId, CancellationToken ct = default)
    {
        var studio = await db.Studios.AsNoTracking().FirstOrDefaultAsync(s => s.Id == studioId, ct);
        if (studio == null)
            return Result.Fail<StudioQuotaDto>($"Studio with ID '{studioId}' was not found.");

        return Result.Ok(new StudioQuotaDto(
            studio.Id,
            studio.Name,
            studio.Slug,
            studio.PlanTier,
            studio.StudioManagedStorageQuotaBytes,
            studio.StudioManagedStorageUsedBytes
        ));
    }

    public async Task<Result<StudioQuotaDto>> GetStudioQuotaBySlugAsync(string slug, CancellationToken ct = default)
    {
        var studio = await db.Studios.AsNoTracking().FirstOrDefaultAsync(s => s.Slug == slug, ct);
        if (studio == null)
            return Result.Fail<StudioQuotaDto>($"Studio with slug '{slug}' was not found.");

        return Result.Ok(new StudioQuotaDto(
            studio.Id,
            studio.Name,
            studio.Slug,
            studio.PlanTier,
            studio.StudioManagedStorageQuotaBytes,
            studio.StudioManagedStorageUsedBytes
        ));
    }

    public async Task<Result> UpdateManagedStorageUsageAsync(Guid studioId, long deltaBytes, CancellationToken ct = default)
    {
        var studio = await db.Studios.FirstOrDefaultAsync(s => s.Id == studioId, ct);
        if (studio == null)
            return Result.Fail($"Studio with ID '{studioId}' was not found.");

        studio.StudioManagedStorageUsedBytes = Math.Max(0, studio.StudioManagedStorageUsedBytes + deltaBytes);
        await db.SaveChangesAsync(ct);
        return Result.Ok();
    }

    public async Task<Result<IReadOnlyList<StudioAdminSummaryDto>>> GetAllStudiosForAdminAsync(CancellationToken ct = default)
    {
        var studios = await db.Studios
            .AsNoTracking()
            .OrderByDescending(s => s.CreatedAt)
            .Select(s => new StudioAdminSummaryDto(
                s.Id,
                s.Name,
                s.Slug,
                s.PlanTier,
                s.StudioManagedStorageQuotaBytes,
                s.StudioManagedStorageUsedBytes,
                s.Projects.Count,
                s.CreatedAt
            ))
            .ToListAsync(ct);

        return Result.Ok<IReadOnlyList<StudioAdminSummaryDto>>(studios);
    }

    public async Task<Result> AdminUpdateStudioQuotaAsync(Guid studioId, AdminUpdateStudioQuotaDto dto, CancellationToken ct = default)
    {
        var studio = await db.Studios.FirstOrDefaultAsync(s => s.Id == studioId, ct);
        if (studio == null)
            return Result.Fail($"Studio with ID '{studioId}' was not found.");

        if (dto.PlanTier.HasValue)
            studio.PlanTier = dto.PlanTier.Value;

        if (dto.StudioManagedStorageQuotaBytes.HasValue)
            studio.StudioManagedStorageQuotaBytes = dto.StudioManagedStorageQuotaBytes.Value;

        await db.SaveChangesAsync(ct);
        return Result.Ok();
    }
}
