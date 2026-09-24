using Automation.Runner.Contracts;
using Automation.Runner.Extensions;
using Automation.Runner.Infrastructure.Persistence;
using Automation.Runner.Infrastructure.Services;
using Automation.SharedKernel.Abstractions.Modules;
using Automation.SharedKernel.Extensions.Modules;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Wolverine;

namespace Automation.Runner;

public class RunnerModule : IModule, IPermissionModule
{
    public string Name => "Runner";
    public string SchemaName => "runner";

    public void ConfigureServices(IServiceCollection services, IConfiguration config)
    {
        services.AddModuleDbContext<RunnerDbContext>(config, SchemaName);
        services.AddScoped<
            Automation.SharedKernel.Abstractions.Auth.ICurrentRunner,
            Automation.SharedKernel.Infrastructure.Auth.CurrentRunner
        >();
        services.AddScoped<
            Automation.SharedKernel.Abstractions.Auth.ICurrentAgent,
            Automation.SharedKernel.Infrastructure.Auth.CurrentRunner
        >();
        services.AddScoped<IRunnerApi, RunnerApiService>();
        services.AddScoped<IAgentApi, RunnerApiService>();
        services.AddRunnerGrpcServices();
    }

    public void ConfigureWolverine(WolverineOptions options)
    {
    }

    public Dictionary<string, IReadOnlyList<string>> GetPermissions() =>
        new Constants.RunnerPermissions().GetPermissions();

    public List<Type> Endpoints => [.. DiscoveredTypes.All];
}

// Backward-compatibility alias
public sealed class AgentModule : RunnerModule
{
}
