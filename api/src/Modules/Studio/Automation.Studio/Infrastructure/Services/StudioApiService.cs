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
}
