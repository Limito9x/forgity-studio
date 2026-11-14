using System.Text.Json;
using Automation.Runner.Contracts;
using FluentResults;
using Wolverine;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record GetRunnerDccSessionsQuery(Guid RunnerId);

public class GetRunnerDccSessionsEndpoint(IMessageBus bus)
    : EndpointWithoutRequest<List<RunnerDccSessionDto>>
{
    public override void Configure()
    {
        Get("{runnerId:guid}/dcc-sessions");
        Group<RunnersGroup>();
        Permissions(P.Runner.GetAll);
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var runnerId = Route<Guid>("runnerId");
        var result = await bus.InvokeAsync<Result<List<RunnerDccSessionDto>>>(
            new GetRunnerDccSessionsQuery(runnerId),
            ct
        );
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetRunnerDccSessionsHandler(IRunnerApi runnerApi)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public async Task<Result<List<RunnerDccSessionDto>>> HandleAsync(
        GetRunnerDccSessionsQuery query,
        CancellationToken ct
    )
    {
        var execResult = await runnerApi.SendExecuteCommandAsync(
            query.RunnerId,
            "forgity",
            ["dcc", "list", "--json"],
            15,
            ct
        );

        if (execResult.IsFailed)
        {
            return Result.Fail<List<RunnerDccSessionDto>>(execResult.Errors);
        }

        var stdout = execResult.Value.Stdout;
        if (string.IsNullOrWhiteSpace(stdout))
        {
            return Result.Ok(new List<RunnerDccSessionDto>());
        }

        try
        {
            var sessions = JsonSerializer.Deserialize<List<RunnerDccSessionDto>>(stdout, JsonOptions);
            return Result.Ok(sessions ?? []);
        }
        catch (Exception ex)
        {
            return Result.Fail<List<RunnerDccSessionDto>>(
                $"Failed to parse runner DCC sessions JSON: {ex.Message} (Raw stdout: {stdout})"
            );
        }
    }
}

