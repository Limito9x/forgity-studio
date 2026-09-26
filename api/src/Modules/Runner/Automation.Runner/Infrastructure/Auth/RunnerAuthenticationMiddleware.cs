using Automation.Runner.Infrastructure.Persistence;
using Automation.SharedKernel.Infrastructure.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Automation.Runner.Infrastructure.Auth;

public class RunnerAuthenticationMiddleware(
    RequestDelegate next,
    IServiceScopeFactory serviceScopeFactory,
    ILogger<RunnerAuthenticationMiddleware> logger)
{
    public const string RunnerKeyHeaderName = "X-Runner-Key";
    public const string LegacyAgentKeyHeaderName = "X-Agent-Key";

    public async Task InvokeAsync(HttpContext context)
    {
        string? runnerKey = null;
        if (context.Request.Headers.TryGetValue(RunnerKeyHeaderName, out var runnerKeyValues))
        {
            runnerKey = runnerKeyValues.ToString();
        }
        else if (context.Request.Headers.TryGetValue(LegacyAgentKeyHeaderName, out var legacyValues))
        {
            runnerKey = legacyValues.ToString();
        }

        if (!string.IsNullOrWhiteSpace(runnerKey))
        {
            using var scope = serviceScopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<RunnerDbContext>();

            var runner = await db.Runners
                .AsNoTracking()
                .FirstOrDefaultAsync(r => r.RegistrationToken == runnerKey && r.IsActive, context.RequestAborted);

            if (runner is not null)
            {
                context.Items[CurrentRunner.HttpContextItemKey] = runner.Id;
                context.Items[CurrentRunner.LegacyHttpContextItemKey] = runner.Id;

                // Update LastSeenAt async without blocking request
                var runnerId = runner.Id;
                _ = Task.Run(async () =>
                {
                    try
                    {
                        using var updateScope = serviceScopeFactory.CreateScope();
                        var updateDb = updateScope.ServiceProvider.GetRequiredService<RunnerDbContext>();
                        var updateRunner = await updateDb.Runners.FindAsync(runnerId);
                        if (updateRunner is not null)
                        {
                            updateRunner.LastSeenAt = DateTimeOffset.UtcNow;
                            await updateDb.SaveChangesAsync();
                        }
                    }
                    catch (Exception ex)
                    {
                        logger.LogError(ex, "Failed to update LastSeenAt for Runner {RunnerId}", runnerId);
                    }
                });
            }
        }

        await next(context);
    }
}

public static class RunnerAuthenticationMiddlewareExtensions
{
    public static IApplicationBuilder UseRunnerAuthentication(this IApplicationBuilder app)
    {
        return app.UseMiddleware<RunnerAuthenticationMiddleware>();
    }

    public static IApplicationBuilder UseAgentAuthentication(this IApplicationBuilder app)
    {
        return app.UseRunnerAuthentication();
    }
}
