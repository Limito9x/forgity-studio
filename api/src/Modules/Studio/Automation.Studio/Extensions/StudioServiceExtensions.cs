using Automation.Studio.Contracts;
using Automation.Studio.Features.Migrations.Domain;
using Automation.Studio.Features.Migrations.Providers;
using Automation.Studio.Features.Migrations.Services;
using Automation.Studio.Infrastructure.Services;
using Microsoft.Extensions.DependencyInjection;

namespace Automation.Studio.Extensions;

public static class StudioServiceExtensions
{
    public static IServiceCollection AddStudioServices(this IServiceCollection services)
    {
        services.AddScoped<IStudioApi, StudioApiService>();
        services.AddScoped<IProjectsApi, StudioApiService>();

        // Project Migrations
        services.AddScoped<IProjectMigrationProvider, PipelineMigrationProvider>();
        services.AddScoped<IProjectMigrationProvider, ContentMigrationProvider>();
        services.AddScoped<ProjectMigrationOrchestrator>();

        return services;
    }

    public static IServiceCollection AddProjectsServices(this IServiceCollection services)
        => services.AddStudioServices();
}
