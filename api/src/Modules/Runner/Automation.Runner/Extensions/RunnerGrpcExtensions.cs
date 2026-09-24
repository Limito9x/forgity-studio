using Automation.Runner.Features.Connections;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

namespace Automation.Runner.Extensions;

public static class RunnerGrpcExtensions
{
    public static IServiceCollection AddRunnerGrpcServices(this IServiceCollection services)
    {
        services.AddGrpc();
        services.AddSingleton<IRunnerConnectionRegistry, RunnerConnectionRegistry>();
        services.AddSingleton<IAgentConnectionRegistry>(sp => sp.GetRequiredService<IRunnerConnectionRegistry>() as RunnerConnectionRegistry ?? new RunnerConnectionRegistry());
        services.AddSingleton<ICommandTracker, CommandTracker>();
        return services;
    }

    public static IEndpointRouteBuilder MapRunnerGrpcServices(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGrpcService<RunnerGrpcService>();
        return endpoints;
    }

    // Backward-compatibility aliases
    public static IServiceCollection AddAgentGrpcServices(this IServiceCollection services) => services.AddRunnerGrpcServices();
    public static IEndpointRouteBuilder MapAgentGrpcServices(this IEndpointRouteBuilder endpoints) => endpoints.MapRunnerGrpcServices();
}
