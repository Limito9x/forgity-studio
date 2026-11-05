using System.Text.Json;
using Automation.Runner.Contracts;
using FluentResults;
using Wolverine;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record StopRunnerDccSessionCommand(
    Guid RunnerId,
    string? Key,
    bool All
);

public class StopRunnerDccSessionEndpoint(IMessageBus bus)
    : Endpoint<StopRunnerDccSessionRequest, StopRunnerDccSessionResponseDto>
{
    public override void Configure()
    {
        Post("{runnerId:guid}/dcc-sessions/stop");
        Group<RunnersGroup>();
        Permissions(P.Runner.Update);
    }

    public override async Task HandleAsync(StopRunnerDccSessionRequest req, CancellationToken ct)
    {
        var runnerId = Route<Guid>("runnerId");
        var command = new StopRunnerDccSessionCommand(runnerId, req.Key, req.All);
        var result = await bus.InvokeAsync<Result<StopRunnerDccSessionResponseDto>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class StopRunnerDccSessionHandler(IRunnerApi runnerApi)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public async Task<Result<StopRunnerDccSessionResponseDto>> HandleAsync(
        StopRunnerDccSessionCommand command,
        CancellationToken ct
    )
    {
        List<string> args;
        if (command.All)
        {
            args = ["dcc", "stop", "--all", "--json"];
        }
        else if (!string.IsNullOrWhiteSpace(command.Key))
        {
            args = ["dcc", "stop", command.Key.Trim(), "--json"];
        }
        else
        {
            return Result.Fail<StopRunnerDccSessionResponseDto>(
                "Either Key or All must be specified to stop DCC resident session."
            );
        }

        var execResult = await runnerApi.SendExecuteCommandAsync(
            command.RunnerId,
            "forgity",
            args,
            15,
            ct
        );

        if (execResult.IsFailed)
        {
            return Result.Fail<StopRunnerDccSessionResponseDto>(execResult.Errors);
        }

        var stdout = execResult.Value.Stdout;
        if (string.IsNullOrWhiteSpace(stdout))
        {
            return Result.Ok(new StopRunnerDccSessionResponseDto { Stopped = 0 });
        }

        try
        {
            var res = JsonSerializer.Deserialize<StopRunnerDccSessionResponseDto>(stdout, JsonOptions);
            return Result.Ok(res ?? new StopRunnerDccSessionResponseDto { Stopped = 0 });
        }
        catch
        {
            return Result.Ok(new StopRunnerDccSessionResponseDto { Stopped = 1 });
        }
    }
}

