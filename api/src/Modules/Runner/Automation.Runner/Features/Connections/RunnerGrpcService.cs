using Automation.Agent.Grpc;
using Grpc.Core;

namespace Automation.Runner.Features.Connections;

public class RunnerGrpcService(
    IRunnerConnectionRegistry registry,
    ICommandTracker commandTracker) : AgentService.AgentServiceBase
{
    private readonly IRunnerConnectionRegistry _registry = registry;
    private readonly ICommandTracker _commandTracker = commandTracker;

    public override async Task Connect(
        IAsyncStreamReader<AgentMessage> requestStream,
        IServerStreamWriter<ServerMessage> responseStream,
        ServerCallContext context)
    {
        try
        {
            if (!await requestStream.MoveNext(context.CancellationToken))
                return;

            var runnerId = Guid.Parse(requestStream.Current.AgentId);

            var connectionId = Guid.NewGuid();
            var connection = new RunnerConnection(
                runnerId,
                connectionId,
                responseStream,
                requestStream
            );

            _registry.Add(connection);

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
    }
}

// Backward-compatibility alias
public class AgentGrpcService(
    IRunnerConnectionRegistry registry,
    ICommandTracker commandTracker) : RunnerGrpcService(registry, commandTracker)
{
}
