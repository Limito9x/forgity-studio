using System.IO.Compression;
using System.Text.Json;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Studio.Features.Migrations.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Wolverine;

namespace Automation.Studio.Features.Migrations.Providers;

public class PipelineMigrationProvider(
    IMessageBus bus,
    PipelineDbContext pipelineDb,
    ILogger<PipelineMigrationProvider> logger
) : IProjectMigrationProvider
{
    public string DomainKey => "pipelines";
    public string DisplayLabel => "Pipelines & Workflows";
    public int SortOrder => 10;

    public async Task<object?> ExportDomainAsync(
        Guid projectId,
        ZipArchive zip,
        CancellationToken ct
    )
    {
        var pipelines = await pipelineDb
            .Pipelines.AsNoTracking()
            .Where(p => p.ProjectId == projectId)
            .Select(p => new { p.Id, p.Name, p.Slug, p.PipelineKind })
            .ToListAsync(ct);

        if (pipelines.Count == 0)
        {
            return null;
        }

        return new { Pipelines = pipelines };
    }

    public Task<DomainMigrationResultSummary> ImportDomainAsync(
        Guid projectId,
        JsonElement domainData,
        ZipArchive? zip,
        ConflictResolutionStrategy strategy,
        CancellationToken ct
    )
    {
        return Task.FromResult(new DomainMigrationResultSummary(0, 0, 0, 0, []));
    }
}
