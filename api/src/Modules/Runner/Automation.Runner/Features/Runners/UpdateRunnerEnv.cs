using System.Text.Json;
using Automation.Runner.Contracts;
using FluentResults;
using Wolverine;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record UpdateRunnerEnvCommand(
    Guid RunnerId,
    Dictionary<string, string> Env,
    List<string>? RemoveKeys = null
);

public class UpdateRunnerEnvRequest
{
    public Dictionary<string, string> Env { get; set; } = [];
    public List<string>? RemoveKeys { get; set; }
}

public class UpdateRunnerEnvEndpoint(IMessageBus bus)
    : Endpoint<UpdateRunnerEnvRequest, Dictionary<string, string>>
{
    public override void Configure()
    {
        Put("{runnerId:guid}/env");
        Group<RunnersGroup>();
        Permissions(P.Runner.Update);
    }

    public override async Task HandleAsync(UpdateRunnerEnvRequest req, CancellationToken ct)
    {
        var runnerId = Route<Guid>("runnerId");
        var command = new UpdateRunnerEnvCommand(runnerId, req.Env, req.RemoveKeys);
        var result = await bus.InvokeAsync<Result<Dictionary<string, string>>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class UpdateRunnerEnvHandler(IRunnerApi runnerApi)
{
    public async Task<Result<Dictionary<string, string>>> HandleAsync(
        UpdateRunnerEnvCommand command,
        CancellationToken ct
    )
    {
        // 1. Process removal keys if requested
        if (command.RemoveKeys is { Count: > 0 })
        {
            foreach (var removeKey in command.RemoveKeys)
            {
                if (string.IsNullOrWhiteSpace(removeKey)) continue;

                var removeRes = await runnerApi.SendExecuteCommandAsync(
                    command.RunnerId,
                    "forgity",
                    ["env", "remove", removeKey.Trim()],
                    15,
                    ct
                );

                if (removeRes.IsFailed)
                {
                    return Result.Fail<Dictionary<string, string>>(removeRes.Errors);
                }
            }
        }

        // 2. Set/update environment variables
        foreach (var (k, v) in command.Env)
        {
            if (string.IsNullOrWhiteSpace(k)) continue;

            var setRes = await runnerApi.SendExecuteCommandAsync(
                command.RunnerId,
                "forgity",
                ["env", "set", k.Trim(), v ?? string.Empty],
                15,
                ct
            );

            if (setRes.IsFailed)
            {
                return Result.Fail<Dictionary<string, string>>(setRes.Errors);
            }
        }

        // 3. Return the fresh latest environment dictionary
        var listRes = await runnerApi.SendExecuteCommandAsync(
            command.RunnerId,
            "forgity",
            ["env", "list", "--json"],
            15,
            ct
        );

        if (listRes.IsFailed)
        {
            return Result.Ok(command.Env);
        }

        try
        {
            var dict = JsonSerializer.Deserialize<Dictionary<string, string>>(listRes.Value.Stdout);
            return Result.Ok(dict ?? command.Env);
        }
        catch
        {
            return Result.Ok(command.Env);
        }
    }
}
