using Automation.SharedKernel.Abstractions.Modules;
using Automation.SharedKernel.Extensions.Modules;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Wolverine;
using Automation.Studio.Infrastructure.Persistence;
using Automation.Studio.Extensions;

namespace Automation.Studio;

public sealed class StudioModule : IModule, IPermissionModule
{
    public string Name => "Studio";
    public string SchemaName => "studio";

    public void ConfigureServices(IServiceCollection services, IConfiguration config)
    {
        services.AddModuleDbContext<StudioDbContext>(config, SchemaName);
        services.AddStudioServices();
    }

    public void ConfigureWolverine(WolverineOptions options)
    {
        // Configure Wolverine if needed
    }

    public Dictionary<string, IReadOnlyList<string>> GetPermissions() 
        => new Constants.StudioPermissions().GetPermissions();

    public List<Type> Endpoints => [..DiscoveredTypes.All];
}
