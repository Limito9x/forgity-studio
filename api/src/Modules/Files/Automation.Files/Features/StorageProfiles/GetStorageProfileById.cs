using FastEndpoints;
using FluentResults;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Automation.Files.Infrastructure.Persistence;
using Automation.SharedKernel.Extensions.Results;

namespace Automation.Files.Features.StorageProfiles;

public record GetStorageProfileByIdQuery(Guid Id);

public class GetStorageProfileByIdEndpoint(IMessageBus bus) : Endpoint<GetStorageProfileByIdQuery, StorageProfileDto>
{
    public override void Configure()
    {
        Get("{id}");
        Group<StorageProfilesGroup>();
        AllowAnonymous();
    }

    public override async Task HandleAsync(GetStorageProfileByIdQuery req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<StorageProfileDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class GetStorageProfileByIdHandler(FilesDbContext dbContext, IMessageBus bus)
{
    public async Task<Result<StorageProfileDto>> HandleAsync(GetStorageProfileByIdQuery query, CancellationToken ct)
    {
        var profile = await dbContext.StorageProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == query.Id, ct);

        if (profile == null)
            return Result.Fail<StorageProfileDto>($"Storage profile '{query.Id}' was not found.");

        var usedBytes = await dbContext.Assets
            .AsNoTracking()
            .Where(x => x.StorageProfileId == profile.Id || (profile.ProviderType == Domain.Enums.StorageProviderType.StudioCloud && profile.IsDefault && x.StorageProfileId == null))
            .SumAsync(x => (long?)x.SizeBytes, ct) ?? 0L;

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

        var quotaBytes = profile.StorageQuotaBytes;
        if (profile.ProviderType == Domain.Enums.StorageProviderType.StudioCloud && !quotaBytes.HasValue)
        {
            quotaBytes = defaultStudioCloudQuotaBytes;
        }

        return Result.Ok(new StorageProfileDto(
            profile.Id,
            profile.StudioId,
            profile.Name,
            profile.ProviderType,
            profile.BucketName,
            profile.ServiceUrl,
            profile.Region,
            profile.AccessKey,
            !string.IsNullOrWhiteSpace(profile.SecretKey),
            profile.PublicBaseUrl,
            usedBytes,
            quotaBytes,
            profile.IsDefault,
            profile.CreatedAt,
            profile.UpdatedAt
        ));
    }
}
