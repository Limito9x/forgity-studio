using FastEndpoints;
using FluentResults;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Automation.Files.Infrastructure.Persistence;
using Automation.SharedKernel.Extensions.Results;

namespace Automation.Files.Features.StorageProfiles;

public record GetStorageProfilesQuery(Guid StudioId);

public class GetStorageProfilesEndpoint(IMessageBus bus) : Endpoint<GetStorageProfilesQuery, IReadOnlyList<StorageProfileDto>>
{
    public override void Configure()
    {
        Get("");
        Group<StorageProfilesGroup>();
    }

    public override async Task HandleAsync(GetStorageProfilesQuery req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<IReadOnlyList<StorageProfileDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class GetStorageProfilesHandler(FilesDbContext dbContext, IMessageBus bus)
{
    public async Task<Result<IReadOnlyList<StorageProfileDto>>> HandleAsync(GetStorageProfilesQuery query, CancellationToken ct)
    {
        var profiles = await dbContext.StorageProfiles
            .AsNoTracking()
            .Where(x => x.StudioId == query.StudioId)
            .OrderByDescending(x => x.IsDefault)
            .ThenBy(x => x.Name)
            .ToListAsync(ct);

        var profileIds = profiles.Select(p => p.Id).ToList();
        var usedBytesByProfile = await dbContext.Assets
            .AsNoTracking()
            .Where(x => (x.StorageProfileId.HasValue && profileIds.Contains(x.StorageProfileId.Value)) || x.StorageProfileId == null)
            .GroupBy(x => x.StorageProfileId)
            .Select(g => new { StorageProfileId = g.Key, TotalBytes = g.Sum(a => a.SizeBytes) })
            .ToListAsync(ct);

        var unassignedBytes = usedBytesByProfile.FirstOrDefault(u => u.StorageProfileId == null)?.TotalBytes ?? 0L;

        long defaultStudioCloudQuotaBytes = 200L * 1024 * 1024;
        try
        {
            var settingResult = await bus.InvokeAsync<Result<string>>(new Automation.SystemAbstractions.GetSystemSettingByKeyQuery("Storage:StudioCloudDefaultQuotaMb"), ct);
            if (settingResult.IsSuccess && long.TryParse(settingResult.Value, out var quotaMb) && quotaMb > 0)
            {
                defaultStudioCloudQuotaBytes = quotaMb * 1024 * 1024;
            }
        }
        catch
        {
            // Fallback default
        }

        var resultList = profiles.Select(p =>
        {
            var usedBytes = usedBytesByProfile.FirstOrDefault(u => u.StorageProfileId == p.Id)?.TotalBytes ?? 0L;
            if (p.ProviderType == Domain.Enums.StorageProviderType.StudioCloud && p.IsDefault)
            {
                usedBytes += unassignedBytes;
            }

            var quotaBytes = p.StorageQuotaBytes;
            if (p.ProviderType == Domain.Enums.StorageProviderType.StudioCloud && !quotaBytes.HasValue)
            {
                quotaBytes = defaultStudioCloudQuotaBytes;
            }

            return new StorageProfileDto(
                p.Id,
                p.StudioId,
                p.Name,
                p.ProviderType,
                p.BucketName,
                p.ServiceUrl,
                p.Region,
                p.AccessKey,
                !string.IsNullOrWhiteSpace(p.SecretKey),
                p.PublicBaseUrl,
                usedBytes,
                quotaBytes,
                p.IsDefault,
                p.CreatedAt,
                p.UpdatedAt
            );
        }).ToList();

        return Result.Ok<IReadOnlyList<StorageProfileDto>>(resultList);
    }
}
