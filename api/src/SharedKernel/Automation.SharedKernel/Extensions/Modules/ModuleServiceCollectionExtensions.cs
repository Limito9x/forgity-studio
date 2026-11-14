using Automation.SharedKernel.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Wolverine.EntityFrameworkCore;

namespace Automation.SharedKernel.Extensions.Modules;

public static class ModuleServiceCollectionExtensions
{
    public static IServiceCollection AddModuleDbContext<TContext>(
        this IServiceCollection services,
        IConfiguration config,
        string schema,
        string? connectionStringName = "Default"
    )
        where TContext : DbContext
    {
        services.AddHttpContextAccessor();
        services.AddSingleton<AuditingInterceptor>();
        services.AddSingleton<AuditLogInterceptor>();
        services.AddSingleton<EntityDeletedInterceptor>();

        services.AddDbContextWithWolverineIntegration<TContext>(
            (sp, options) =>
            {
                options.UseNpgsql(npgsql =>
                {
                    npgsql.MigrationsHistoryTable("__EFMigrationsHistory", schema);
                });
                options.AddInterceptors(
                    sp.GetRequiredService<AuditingInterceptor>(),
                    sp.GetRequiredService<AuditLogInterceptor>(),
                    sp.GetRequiredService<EntityDeletedInterceptor>()
                );
            }
        );

        return services;
    }
}
