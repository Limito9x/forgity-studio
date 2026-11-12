using FluentResults;

namespace Automation.Studio.Contracts;

public interface IStudioApi
{
    Task<Result<StudioQuotaDto>> GetStudioQuotaAsync(Guid studioId, CancellationToken ct = default);
    Task<Result<StudioQuotaDto>> GetStudioQuotaBySlugAsync(string slug, CancellationToken ct = default);
    Task<Result> ConsumeExecutionCreditAsync(Guid studioId, int amount = 1, CancellationToken ct = default);
    Task<Result> UpdateManagedStorageUsageAsync(Guid studioId, long deltaBytes, CancellationToken ct = default);
    Task<Result<IReadOnlyList<StudioAdminSummaryDto>>> GetAllStudiosForAdminAsync(CancellationToken ct = default);
    Task<Result> AdminUpdateStudioQuotaAsync(Guid studioId, AdminUpdateStudioQuotaDto dto, CancellationToken ct = default);
}

public interface IProjectsApi : IStudioApi
{
    Task<Guid?> GetProjectStorageProfileIdAsync(Guid projectId, CancellationToken ct = default);
}
