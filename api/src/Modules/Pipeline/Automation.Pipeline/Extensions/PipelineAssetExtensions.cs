using Automation.Files.Contracts;
using Automation.Pipeline.Constants;
using Microsoft.Extensions.DependencyInjection;

namespace Automation.Pipeline.Extensions;

public static class PipelineAssetExtensions
{
    public static IServiceCollection AddPipelineAssetSlots(this IServiceCollection services)
    {
        // 1. Slot cho file script tùy chỉnh của NodeDefinition
        services.AddAssetSlot(
            entityType: "NodeDefinition",
            slotKey: PipelineAssetSlots.CustomScript,
            options: new AssetCategoryOptions
            {
                AllowMultiple = false,
                MaxCount = 1,
                MaxSizeBytes = 50 * 1024 * 1024, // 50MB
                AllowedContentTypes = []
            }
        );

        // 2. Slot cho file đính kèm trực tiếp trong cấu hình của PipelineNode
        services.AddAssetSlot(
            entityType: "PipelineNode",
            slotKey: PipelineAssetSlots.NodeConfig,
            options: new AssetCategoryOptions
            {
                AllowSubSlots = true,
                AllowMultiple = true,
                MaxSizeBytes = 10L * 1024 * 1024 * 1024, // 10GB
                AllowedContentTypes = []
            }
        );

        // 3. Slot cho file runtime input khi kích hoạt PipelineExecution
        services.AddAssetSlot(
            entityType: "PipelineExecution",
            slotKey: PipelineAssetSlots.RuntimeInput,
            options: new AssetCategoryOptions
            {
                AllowMultiple = true,
                MaxSizeBytes = 10L * 1024 * 1024 * 1024, // 10GB
                AllowedContentTypes = []
            }
        );

        return services;
    }
}
