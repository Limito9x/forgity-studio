using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Automation.SharedKernel.Infrastructure.Persistence;
using Wolverine.EntityFrameworkCore;

namespace Automation.SharedKernel.Extensions.Modules;

public static class ModuleServiceCollectionExtensions
{
    public static IServiceCollection AddModuleDbContext<TContext>(
        this IServiceCollection services,
        IConfiguration config,
        string schema,
        string? connectionStringName = "Default")
        where TContext : DbContext
    {
        services.AddHttpContextAccessor();
        services.AddSingleton<AuditingInterceptor>();
        services.AddSingleton<AuditLogInterceptor>();
        services.AddScoped<EntityDeletedInterceptor>();

        // Register scoped options first: they contain a scoped, outbox-aware interceptor.
        // Wolverine's convenience registration otherwise defaults options to singleton.
        services.AddDbContext<TContext>((sp, options) =>
        {

            options.UseNpgsql(
                config.GetConnectionString(connectionStringName ?? "Default"),
                npgsql =>
                {
                    npgsql.MigrationsHistoryTable(
                        "__EFMigrationsHistory",
                        schema);
                });
            options.AddInterceptors(
                sp.GetRequiredService<AuditingInterceptor>(),
                sp.GetRequiredService<AuditLogInterceptor>(),
                sp.GetRequiredService<EntityDeletedInterceptor>()
            );
        }, optionsLifetime: ServiceLifetime.Scoped);
        services.AddDbContextWithWolverineIntegration<TContext>(_ => { });

        return services;
    }
}


