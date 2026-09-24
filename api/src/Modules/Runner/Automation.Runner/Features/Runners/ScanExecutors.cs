using Automation.Runner.Contracts;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record ScanExecutorsRequest(string? ExecutorKey = null);

public record ScanExecutorsCommand(
    Guid RunnerId,
    string? ExecutorKey = null
);

public class ScanExecutorsEndpoint(IMessageBus bus)
    : Endpoint<ScanExecutorsRequest, IReadOnlyList<ExecutorCandidateDto>>
{
    public override void Configure()
    {
        Post("{runnerId:guid}/executors/scan");
        Group<RunnersGroup>();
        Permissions(P.Runner.Update);
    }

    public override async Task HandleAsync(ScanExecutorsRequest req, CancellationToken ct)
    {
        var runnerId = Route<Guid>("runnerId");
        var command = new ScanExecutorsCommand(runnerId, req.ExecutorKey);
        var result = await bus.InvokeAsync<Result<IReadOnlyList<ExecutorCandidateDto>>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class ScanExecutorsHandler(IRunnerApi runnerApi)
{
    public async Task<Result<IReadOnlyList<ExecutorCandidateDto>>> HandleAsync(ScanExecutorsCommand command, CancellationToken ct)
    {
        return await runnerApi.SendScanExecutorsCommandAsync(command.RunnerId, command.ExecutorKey, ct);
    }
}
