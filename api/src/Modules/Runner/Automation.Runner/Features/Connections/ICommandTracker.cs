using Automation.Agent.Grpc;

namespace Automation.Runner.Features.Connections;

public interface ICommandTracker
{
    Task<CommandResponse> RegisterCommandAsync(string commandId, CancellationToken cancellationToken = default);
    bool CompleteCommand(CommandResponse response);
    bool FailCommand(string commandId, string errorMessage);
}
