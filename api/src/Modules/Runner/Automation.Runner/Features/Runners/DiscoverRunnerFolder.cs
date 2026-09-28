using Automation.Runner.Contracts;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record DiscoverRunnerFolderQuery(
    Guid Id,
    string? Path = null,
    bool IncludeFiles = false,
    string? Extensions = null
);

public record DirectoryNodeDto(
    string Name,
    string Path,
    bool HasChildren = false,
    bool IsDirectory = true,
    long SizeBytes = 0,
    string? Extension = null
);

public record SystemPlaceDto(
    string Name,
    string Path
);

public record DriveInfoDto(
    string Mount,
    string Label,
    long TotalBytes,
    long FreeBytes
);

public record DiscoverRunnerFolderResult(
    string CurrentPath,
    string ParentPath,
    bool CanNavigateUp,
    IReadOnlyList<DirectoryNodeDto> Items,
    IReadOnlyList<SystemPlaceDto> SystemPlaces,
    IReadOnlyList<string> PinnedFolders,
    IReadOnlyList<DriveInfoDto> Drives
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

        var allowedExts = string.IsNullOrWhiteSpace(request.Extensions)
            ? []
            : request.Extensions.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(e => e.StartsWith('.') ? e.ToLowerInvariant() : $".{e.ToLowerInvariant()}")
                .ToHashSet();

        var items = (result.Value.Items ?? [])
            .Where(x =>
            {
                if (x.IsDirectory) return true;
                if (!request.IncludeFiles) return false;
                if (allowedExts.Count == 0) return true;
                var ext = System.IO.Path.GetExtension(x.Name).ToLowerInvariant();
                return allowedExts.Contains(ext);
            })
            .Select(x => new DirectoryNodeDto(
                x.Name,
                x.Path,
                HasChildren: x.IsDirectory,
                IsDirectory: x.IsDirectory,
                SizeBytes: x.SizeBytes,
                Extension: x.IsDirectory ? null : System.IO.Path.GetExtension(x.Name).ToLowerInvariant()
            ))
            .OrderByDescending(x => x.IsDirectory)
            .ThenBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var systemPlaces = (result.Value.SystemPlaces ?? [])
            .Select(p => new SystemPlaceDto(p.Name, p.Path))
            .ToList();

        var pinnedFolders = (result.Value.PinnedFolders ?? []).ToList();

        var drives = (result.Value.Drives ?? [])
            .Select(d => new DriveInfoDto(d.Mount, d.Label, d.TotalBytes, d.FreeBytes))
            .ToList();

        return Result.Ok(new DiscoverRunnerFolderResult(
            result.Value.CurrentPath,
            result.Value.ParentPath,
            result.Value.CanNavigateUp,
            items,
            systemPlaces,
            pinnedFolders,
            drives
        ));
    }
}
