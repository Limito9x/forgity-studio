using Automation.SharedKernel.Abstractions.Modules;
using Automation.SharedKernel.Extensions.Modules;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Wolverine;
using Automation.Repository.Infrastructure.Persistence;

namespace Automation.Repository;

public sealed class RepositoryModule : IModule, IPermissionModule
{
    public string Name => "Repository";
    public string SchemaName => "repository";

    public void ConfigureServices(IServiceCollection services, IConfiguration config)
    {
        services.AddModuleDbContext<RepositoryDbContext>(config, SchemaName);
        services.AddResourceAssetSlots();
        services.AddScoped<Automation.Repository.Contracts.IRepositoryApi, Infrastructure.Services.RepositoryApi>();
    }

    public void ConfigureWolverine(WolverineOptions options)
    {
        // Configure Wolverine if needed
    }

    public Dictionary<string, IReadOnlyList<string>> GetPermissions() 
        => new Constants.RepositoryPermissions().GetPermissions();

    public List<Type> Endpoints => [..DiscoveredTypes.All];
}

