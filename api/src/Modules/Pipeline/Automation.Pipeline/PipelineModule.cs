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
        services.AddHttpClient();
    }

    public void ConfigureWolverine(WolverineOptions options) { }

    public Dictionary<string, IReadOnlyList<string>> GetPermissions() =>
        new Constants.PipelinePermissions().GetPermissions();

    public List<Type> Endpoints => [.. DiscoveredTypes.All];
}
