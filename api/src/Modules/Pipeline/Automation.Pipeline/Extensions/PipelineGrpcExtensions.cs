using Automation.Pipeline.Runtime.Features.Execution;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace Automation.Pipeline.Extensions;

public static class PipelineGrpcExtensions
{
    public static IServiceCollection AddPipelineGrpcServices(this IServiceCollection services)
    {
        services.AddGrpc();
        return services;
    }

    public static IEndpointRouteBuilder MapPipelineGrpcServices(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGrpcService<ExecutionStateGrpcService>();
        return endpoints;
    }
}
