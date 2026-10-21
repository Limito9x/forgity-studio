using Automation.Runner.Contracts;
using FluentResults;
using Wolverine;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record ExecuteRunnerCommand(
    Guid RunnerId,
    string Program,
    List<string> Args,
    int TimeoutSeconds = 30
);

public class ExecuteRunnerCommandRequest
{
    public string Program { get; set; } = "forgity";
    public List<string> Args { get; set; } = [];
    public int TimeoutSeconds { get; set; } = 30;
}

public class ExecuteRunnerCommandEndpoint(IMessageBus bus)
    : Endpoint<ExecuteRunnerCommandRequest, ExecuteCommandResponseDto>
{
    public override void Configure()
    {
        Post("{runnerId:guid}/execute");
        Group<RunnersGroup>();
        Permissions(P.Runner.Update);
    }

    public override async Task HandleAsync(ExecuteRunnerCommandRequest req, CancellationToken ct)
    {
        var runnerId = Route<Guid>("runnerId");
        var command = new ExecuteRunnerCommand(runnerId, req.Program, req.Args, req.TimeoutSeconds);
        var result = await bus.InvokeAsync<Result<ExecuteCommandResponseDto>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class ExecuteRunnerCommandHandler(IRunnerApi runnerApi)
{
    public async Task<Result<ExecuteCommandResponseDto>> HandleAsync(
        ExecuteRunnerCommand command,
        CancellationToken ct
    )
    {
        return await runnerApi.SendExecuteCommandAsync(
            command.RunnerId,
            command.Program,
            command.Args,
            command.TimeoutSeconds,
            ct
        );
    }
}
