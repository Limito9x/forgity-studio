using Automation.Agent.Grpc;
using Grpc.Core;

namespace Automation.Runner.Features.Connections;

public class RunnerConnection
{
    public Guid RunnerId { get; }
    public Guid ConnectionId { get; }
    public IServerStreamWriter<ServerMessage> ResponseStream { get; set; } = null!;
    public IAsyncStreamReader<AgentMessage> RequestStream { get; set; } = null!;

    public RunnerConnection(
        Guid runnerId,
        Guid connectionId,
        IServerStreamWriter<ServerMessage> responseStream,
        IAsyncStreamReader<AgentMessage> requestStream)
    {
        RunnerId = runnerId;
        ConnectionId = connectionId;
        ResponseStream = responseStream;
        RequestStream = requestStream;
    }
}

// Backward-compatibility alias
public class AgentConnection : RunnerConnection
{
    public Guid AgentId => RunnerId;

    public AgentConnection(
        Guid agentId,
        Guid connectionId,
        IServerStreamWriter<ServerMessage> responseStream,
        IAsyncStreamReader<AgentMessage> requestStream)
        : base(agentId, connectionId, responseStream, requestStream)
    {
    }
}
