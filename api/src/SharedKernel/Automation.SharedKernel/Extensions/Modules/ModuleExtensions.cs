using Automation.SharedKernel.Abstractions.Modules;
using Automation.SharedKernel.Extensions.Auth;
using Automation.SharedKernel.Extensions.RabbitMq;
using Automation.SharedKernel.Infrastructure.Caching;
using JasperFx.CodeGeneration;
using JasperFx.CodeGeneration.Model;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Wolverine;
using Wolverine.Postgresql;

namespace Automation.SharedKernel.Extensions.Modules;

public static class ModuleBuilderExtensions
{
    public static WebApplicationBuilder AddModules(
        this WebApplicationBuilder builder,
        IEnumerable<IModule> modules
    )
    {
        var enumerable = modules as IModule[] ?? [.. modules];
        foreach (var module in enumerable)
        {
            module.ConfigureServices(builder.Services, builder.Configuration);
        }

        builder.Services.AddModulePermissions(enumerable);

        // Dang ky FusionCache
        builder.Services.AddFusionCache();

        builder.Services.AddSingleton<
            IAssemblyGenerator,
            JasperFx.RuntimeCompiler.AssemblyGenerator
        >();

        builder.Host.UseWolverine(options =>
        {
            options.Durability.Mode = DurabilityMode.Solo;
            options.CodeGeneration.TypeLoadMode = TypeLoadMode.Auto;
            options.ServiceLocationPolicy = ServiceLocationPolicy.AllowedButWarn;

            var connectionString = builder.Configuration.GetConnectionString("Default");
            if (!string.IsNullOrWhiteSpace(connectionString))
            {
                var dataSourceBuilder = new NpgsqlDataSourceBuilder(connectionString);
                dataSourceBuilder.EnableDynamicJson();
                var dataSource = dataSourceBuilder.Build();

                builder.Services.AddSingleton(dataSource);

                options.PersistMessagesWithPostgresql(dataSource, "wolverine");
            }

            options.UseSharedRabbitMq(builder.Configuration);

            options.Policies.UseDurableLocalQueues();
            options.Policies.UseDurableOutboxOnAllSendingEndpoints();
            options.Policies.AutoApplyTransactions();
            options.Policies.Add<CachingPolicy>();

            foreach (var module in enumerable)
            {
                options.Discovery.IncludeAssembly(module.GetType().Assembly);
                module.ConfigureWolverine(options);
            }
        });

        return builder;
    }
}
