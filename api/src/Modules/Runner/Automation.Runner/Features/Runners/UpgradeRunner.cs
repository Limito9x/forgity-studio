using Automation.Runner.Contracts;
using FluentResults;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record UpgradeRunnerRequest(
    string DownloadUrl,
    string TargetVersion,
    string? ExpectedSha256 = null
);

public record UpgradeRunnerCommand(
    Guid RunnerId,
    string DownloadUrl,
    string TargetVersion,
    string ExpectedSha256
);

public class UpgradeRunnerEndpoint(IMessageBus bus)
    : Endpoint<UpgradeRunnerRequest, RunnerUpdateResultDto>
{
    public override void Configure()
    {
        Post("{runnerId:guid}/upgrade");
        Group<RunnersGroup>();
        Permissions(P.Runner.Update);
    }

    public override async Task HandleAsync(UpgradeRunnerRequest req, CancellationToken ct)
    {
        var runnerId = Route<Guid>("runnerId");
        var command = new UpgradeRunnerCommand(
            runnerId,
            req.DownloadUrl,
            req.TargetVersion,
            req.ExpectedSha256 ?? string.Empty
        );
        var result = await bus.InvokeAsync<Result<RunnerUpdateResultDto>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class UpgradeRunnerHandler(IRunnerApi runnerApi)
{
    public async Task<Result<RunnerUpdateResultDto>> HandleAsync(UpgradeRunnerCommand command, CancellationToken ct)
    {
        return await runnerApi.SendUpdateRunnerCommandAsync(
            command.RunnerId,
            command.DownloadUrl,
            command.TargetVersion,
            command.ExpectedSha256,
            ct
        );
    }
}
