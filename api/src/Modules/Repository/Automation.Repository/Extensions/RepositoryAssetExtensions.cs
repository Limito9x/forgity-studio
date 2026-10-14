using Automation.Files.Contracts;
using Automation.Repository.Constants;
using Microsoft.Extensions.DependencyInjection;

namespace Automation.Repository.Extensions;

public static class RepositoryAssetExtensions
{
    public static IServiceCollection AddResourceAssetSlots(this IServiceCollection services)
    {
        services.AddAssetSlot(
            entityType: "ResourceVersion",
            slotKey: ResourceAssetSlots.ResourceVersion,
            options: new AssetCategoryOptions
            {
                AllowMultiple = false,
                MaxCount = 1,
                MaxSizeBytes = 50L * 1024 * 1024 * 1024, // 50GB
                AllowedContentTypes = null // Allow any content type, extension is validated by Repository
            }
        );


        return services;
    }
}

