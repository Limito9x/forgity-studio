using Automation.Pipeline.BuildTime.Features.Authoring.Dtos;
using Automation.Pipeline.BuildTime.Graph;
using Automation.Pipeline.BuildTime.Services;
using Automation.Pipeline.Contracts.NodeContract;
using Automation.Pipeline.Contracts.Validation;
using Automation.Pipeline.Extensions;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.SharedKernel.Abstractions.Modules;
using Automation.SharedKernel.Extensions.Modules;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Wolverine;

namespace Automation.Pipeline;

public sealed class PipelineModule : IModule, IPermissionModule
{
    public string Name => "Pipeline";
    public string SchemaName => "pipeline";

    public void ConfigureServices(IServiceCollection services, IConfiguration config)
    {
        services.AddModuleDbContext<PipelineDbContext>(config, SchemaName);
        services.AddPipelineTools();
        services.AddPipelineAssetSlots();

        services.AddScoped<INodeContractResolver, PipelineNodeContractResolver>();
        services.AddScoped<IPipelineContractValidator, PipelineContractValidator>();
        services.AddScoped<ITransientPipelineGraphFactory, TransientPipelineGraphFactory>();
        services.AddScoped<IPipelineGraphDtoBuilder, PipelineGraphDtoBuilder>();
        services.AddSingleton<NativePythonScriptAnalyzer>();
        services.AddSingleton<IScriptSchemaAnalyzer, HybridScriptSchemaAnalyzer>();
        services.AddHttpClient();
    }

    public void ConfigureWolverine(WolverineOptions options)
    {
    }

    public Dictionary<string, IReadOnlyList<string>> GetPermissions() 
        => new Constants.PipelinePermissions().GetPermissions();

    public List<Type> Endpoints => [.. DiscoveredTypes.All];
}
