using Automation.Studio.Contracts;
using Automation.Studio.Infrastructure.Services;
using Microsoft.Extensions.DependencyInjection;

namespace Automation.Studio.Extensions;

public static class StudioServiceExtensions
{
    public static IServiceCollection AddStudioServices(this IServiceCollection services)
    {
        services.AddScoped<IStudioApi, StudioApiService>();
        services.AddScoped<IProjectsApi, StudioApiService>();
        return services;
    }

    public static IServiceCollection AddProjectsServices(this IServiceCollection services)
        => services.AddStudioServices();
}
