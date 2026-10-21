using System.Text.Json;
using Automation.Runner.Contracts;
using FluentResults;
using Wolverine;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record GetRunnerEnvQuery(Guid RunnerId);

public class GetRunnerEnvEndpoint(IMessageBus bus)
    : EndpointWithoutRequest<Dictionary<string, string>>
{
    public override void Configure()
    {
        Get("{runnerId:guid}/env");
        Group<RunnersGroup>();
        Permissions(P.Runner.GetAll);
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var runnerId = Route<Guid>("runnerId");
        var result = await bus.InvokeAsync<Result<Dictionary<string, string>>>(
            new GetRunnerEnvQuery(runnerId),
            ct
        );
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetRunnerEnvHandler(IRunnerApi runnerApi)
{
    public async Task<Result<Dictionary<string, string>>> HandleAsync(
        GetRunnerEnvQuery query,
        CancellationToken ct
    )
    {
        var execResult = await runnerApi.SendExecuteCommandAsync(
            query.RunnerId,
            "forgity",
            ["env", "list", "--json"],
            15,
            ct
        );

        if (execResult.IsFailed)
        {
            return Result.Fail<Dictionary<string, string>>(execResult.Errors);
        }

        var stdout = execResult.Value.Stdout;
        if (string.IsNullOrWhiteSpace(stdout))
        {
            return Result.Ok(new Dictionary<string, string>());
        }

        try
        {
            var dict = JsonSerializer.Deserialize<Dictionary<string, string>>(stdout);
            return Result.Ok(dict ?? []);
        }
        catch (Exception ex)
        {
            return Result.Fail<Dictionary<string, string>>(
                $"Failed to parse runner environment JSON: {ex.Message} (Raw stdout: {stdout})"
            );
        }
    }
}
