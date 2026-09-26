using Automation.Runner.Contracts;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record DiscoverRunnerFolderQuery(
    Guid Id,
    string? Path = null
);

public record DirectoryNodeDto(
    string Name,
    string Path,
    bool HasChildren = false
);

public record DiscoverRunnerFolderResult(
    string CurrentPath,
    string ParentPath,
    bool CanNavigateUp,
    IReadOnlyList<DirectoryNodeDto> Items
);

public class DiscoverRunnerFolderEndpoint(IMessageBus bus)
    : Endpoint<DiscoverRunnerFolderQuery, DiscoverRunnerFolderResult>
{
    public override void Configure()
    {
        Get("{id:guid}/discover-folders");
        Group<RunnersGroup>();
        Permissions(P.Runner.GetAll);
        Description(x => x.WithName("DiscoverRunnerFolders"));
    }

    public override async Task HandleAsync(DiscoverRunnerFolderQuery query, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<DiscoverRunnerFolderResult>>(query, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class DiscoverRunnerFolderHandler(IRunnerApi runnerApi)
{
    public async Task<Result<DiscoverRunnerFolderResult>> HandleAsync(DiscoverRunnerFolderQuery request, CancellationToken ct)
    {
        var targetPath = request.Path?.Trim() ?? string.Empty;
        var result = await runnerApi.SendBrowseCommandAsync(request.Id, targetPath, ct);
        if (result.IsFailed)
        {
            return result.ToResult();
        }

        var items = (result.Value.Items ?? [])
            .Where(x => x.IsDirectory)
            .Select(x => new DirectoryNodeDto(x.Name, x.Path))
            .OrderBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return Result.Ok(new DiscoverRunnerFolderResult(
            result.Value.CurrentPath,
            result.Value.ParentPath,
            result.Value.CanNavigateUp,
            items
        ));
    }
}
