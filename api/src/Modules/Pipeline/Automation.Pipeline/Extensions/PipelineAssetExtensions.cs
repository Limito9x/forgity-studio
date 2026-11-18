using Automation.Files.Contracts;
using Automation.Pipeline.Constants;
using Microsoft.Extensions.DependencyInjection;

namespace Automation.Pipeline.Extensions;

public static class PipelineAssetExtensions
{
    public static IServiceCollection AddPipelineAssetSlots(this IServiceCollection services)
    {
        services.AddAssetSlot(
            entityType: "TemplatePackage",
            slotKey: PipelineAssetSlots.TemplatePinAsset,
            options: new AssetCategoryOptions
            {
                AllowMultiple = true,
                MaxCount = 100,
                MaxSizeBytes = 250 * 1024 * 1024, // 250MB per pin asset
                AllowedContentTypes = [],
            }
        );
        return services;
    }
}
