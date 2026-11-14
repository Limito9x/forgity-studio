using Automation.Pipeline.Contracts.StructRegistry;
using Automation.Pipeline.Contracts.Tools;
using Microsoft.Extensions.DependencyInjection;

namespace Automation.Pipeline.Extensions;

public static class PipelineToolExtensions
{
    public static IServiceCollection AddPipelineTools(this IServiceCollection services)
    {
        var assembly = typeof(PipelineModule).Assembly;

        var toolTypes = assembly
            .GetTypes()
            .Where(t => typeof(IResolverTool).IsAssignableFrom(t) && t is { IsClass: true, IsAbstract: false });

        foreach (var toolType in toolTypes)
        {
            services.AddScoped(typeof(IResolverTool), toolType);
        }

        services.AddScoped<IToolRegistry, ToolRegistry>();

        // Register all Entity Struct Definitions (Static C# Structs only)
        var structTypes = assembly
            .GetTypes()
            .Where(t => typeof(IEntityStructDefinition).IsAssignableFrom(t)
                     && t is { IsClass: true, IsAbstract: false }
                     && t != typeof(Contracts.StructRegistry.Definitions.DynamicEntityStructDefinition));

        foreach (var structType in structTypes)
        {
            services.AddScoped(typeof(IEntityStructDefinition), structType);
        }

        services.AddScoped<IEntityStructRegistry, EntityStructRegistry>();

        return services;
    }
}
