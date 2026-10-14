using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using StackExchange.Redis;
using TickerQ.Caching.StackExchangeRedis.DependencyInjection;
using TickerQ.Dashboard.DependencyInjection;
using TickerQ.DependencyInjection;

namespace Automation.SharedKernel.Extensions.Jobs;

public static class JobExtensions
{
    public static IServiceCollection AddJobServices(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var redisConnStr = configuration.GetConnectionString("Redis") ?? "localhost:6379";
        ConfigurationOptions redisOptions;

        if (redisConnStr.StartsWith("rediss://", StringComparison.OrdinalIgnoreCase) ||
            redisConnStr.StartsWith("redis://", StringComparison.OrdinalIgnoreCase))
        {
            var uri = new Uri(redisConnStr);
            redisOptions = new ConfigurationOptions
            {
                EndPoints = { { uri.Host, uri.Port > 0 ? uri.Port : 6379 } },
                Ssl = uri.Scheme.Equals("rediss", StringComparison.OrdinalIgnoreCase),
                AbortOnConnectFail = false
            };

            if (!string.IsNullOrEmpty(uri.UserInfo))
            {
                var parts = uri.UserInfo.Split(':', 2);
                if (parts.Length == 2)
                {
                    redisOptions.Password = Uri.UnescapeDataString(parts[1]);
                    if (!string.IsNullOrEmpty(parts[0]) && parts[0] != "default")
                    {
                        redisOptions.User = Uri.UnescapeDataString(parts[0]);
                    }
                }
                else
                {
                    redisOptions.Password = Uri.UnescapeDataString(parts[0]);
                }
            }
        }
        else
        {
            redisOptions = ConfigurationOptions.Parse(redisConnStr);
            redisOptions.AbortOnConnectFail = false;
        }

        var multiplexer = ConnectionMultiplexer.Connect(redisOptions);

        services.AddTickerQ(options =>
        {
            options.AddStackExchangeRedis(redisOpt =>
            {
                redisOpt.ConnectionMultiplexer = multiplexer;
            });

            options.AddDashboard(dashOpt =>
            {
                var username = configuration["TickerQ:BasicAuth:Username"];
                var password = configuration["TickerQ:BasicAuth:Password"];

                dashOpt.SetBasePath("/tickerq-dashboard");
                
                if (!string.IsNullOrEmpty(username) && !string.IsNullOrEmpty(password))
                {
                    dashOpt.WithBasicAuth(username, password);
                }
            });
        });

        return services;
    }

    public static WebApplication UseJobMiddleware(this WebApplication app)
    {
        app.UseTickerQ();
        return app;
    }
}


