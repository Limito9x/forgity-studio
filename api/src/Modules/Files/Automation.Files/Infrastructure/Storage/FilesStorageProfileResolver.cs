using Automation.Files.Contracts;
using Automation.Files.Domain.Enums;
using Automation.Files.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Automation.Files.Infrastructure.Storage;

public class FilesStorageProfileResolver(IServiceScopeFactory scopeFactory) : IStorageProfileResolver
{
    public async Task<StorageConfigDto?> ResolveProfileAsync(Guid storageProfileId, CancellationToken ct = default)
    {
        using var scope = scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<FilesDbContext>();

        var profile = await dbContext.StorageProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == storageProfileId, ct);

        if (profile == null)
            return null;

        var isStudioCloud = profile.ProviderType == StorageProviderType.StudioCloud;

        return new StorageConfigDto(
            profile.BucketName,
            profile.ServiceUrl,
            profile.AccessKey,
            profile.SecretKey,
            profile.PublicBaseUrl,
            profile.Region,
            isStudioCloud,
            profile.StorageQuotaBytes
        );
    }
}
