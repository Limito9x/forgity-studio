using Automation.Agent.Grpc;
using Automation.Runner.Infrastructure.Persistence;
using Grpc.Core;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Automation.Runner.Features.Connections;

public class RunnerGrpcService(
    IRunnerConnectionRegistry registry,
    ICommandTracker commandTracker,
    IServiceScopeFactory scopeFactory,
    ILogger<RunnerGrpcService> logger) : AgentService.AgentServiceBase
{
    private readonly IRunnerConnectionRegistry _registry = registry;
    private readonly ICommandTracker _commandTracker = commandTracker;
    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
    private readonly ILogger<RunnerGrpcService> _logger = logger;

    public override async Task Connect(
        IAsyncStreamReader<AgentMessage> requestStream,
        IServerStreamWriter<ServerMessage> responseStream,
        ServerCallContext context)
    {
        try
        {
            if (!await requestStream.MoveNext(context.CancellationToken))
                return;

            var firstMsg = requestStream.Current;
            var runnerId = Guid.Parse(firstMsg.AgentId);
            var appVersion = firstMsg.AppVersion;

            await UpdateRunnerHandshakeAsync(runnerId, appVersion, context.CancellationToken);

            var connectionId = Guid.NewGuid();
            var connection = new RunnerConnection(
                runnerId,
                connectionId,
                responseStream,
                requestStream
            );

            _registry.Add(connection);
            _logger.LogInformation("Runner {RunnerId} connected (version: {Version})", runnerId, appVersion);

            try
            {
                while (!context.CancellationToken.IsCancellationRequested &&
                       await requestStream.MoveNext(context.CancellationToken))
                {
                    var message = requestStream.Current;
                    if (message.PayloadCase == AgentMessage.PayloadOneofCase.CommandResponse)
                    {
                        _commandTracker.CompleteCommand(message.CommandResponse);
                    }
                }
            }
            finally
            {
                _registry.Remove(runnerId, connectionId);
                _logger.LogInformation("Runner {RunnerId} disconnected", runnerId);
                await UpdateRunnerLastSeenAsync(runnerId);
            }
        }
        catch (OperationCanceledException)
        {
            // Normal graceful shutdown or client disconnect
        }
        catch (IOException)
        {
            // Connection closed by host shutdown
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error in Runner gRPC Connect stream");
        }
    }

    private async Task UpdateRunnerHandshakeAsync(Guid runnerId, string? appVersion, CancellationToken ct)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<RunnerDbContext>();
            var runner = await db.Runners.FirstOrDefaultAsync(r => r.Id == runnerId, ct);
            if (runner != null)
            {
                runner.LastSeenAt = DateTimeOffset.UtcNow;
                if (!string.IsNullOrWhiteSpace(appVersion))
                {
                    runner.AppVersion = appVersion.Trim();
                }
                await db.SaveChangesAsync(ct);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to update runner handshake for {RunnerId}", runnerId);
        }
    }

    private async Task UpdateRunnerLastSeenAsync(Guid runnerId)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<RunnerDbContext>();
            var runner = await db.Runners.FirstOrDefaultAsync(r => r.Id == runnerId);
            if (runner != null)
            {
                runner.LastSeenAt = DateTimeOffset.UtcNow;
                await db.SaveChangesAsync();
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to update last seen for {RunnerId}", runnerId);
        }
    }
}

// Backward-compatibility alias
public class AgentGrpcService(
    IRunnerConnectionRegistry registry,
    ICommandTracker commandTracker,
    IServiceScopeFactory scopeFactory,
    ILogger<RunnerGrpcService> logger) : RunnerGrpcService(registry, commandTracker, scopeFactory, logger)
{
}
