using Automation.Studio.Features.Migrations.Dtos;
using Automation.Studio.Features.Projects;
using Automation.Studio.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Automation.Studio.Features.Migrations;

public class GetProjectMigrationHistoryRequestModel : PagedQuery
{
    public Guid Id { get; set; }
}

public class GetProjectMigrationHistoryEndpoint(StudioDbContext db)
    : Endpoint<GetProjectMigrationHistoryRequestModel, PagedResult<ProjectMigrationLogDto>>
{
    public override void Configure()
    {
        Get("/{id:guid}/migrations/history");
        Group<ProjectsGroup>();
        Permissions(P.Project.GetById);
        Description(x => x.WithName("GetProjectMigrationHistory"));
    }

    public override async Task HandleAsync(GetProjectMigrationHistoryRequestModel req, CancellationToken ct)
    {
        var page = req.Page.GetValueOrDefault(1);
        if (page <= 0) page = 1;
        var pageSize = req.PageSize.GetValueOrDefault(20);
        if (pageSize <= 0) pageSize = 20;

        var query = db.ProjectMigrationLogs
            .AsNoTracking()
            .Where(x => x.ProjectId == req.Id)
            .OrderByDescending(x => x.CreatedAt);

        var total = await query.CountAsync(ct);

        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new ProjectMigrationLogDto(
                x.Id,
                x.ProjectId,
                x.StudioId,
                x.UserId,
                x.UserDisplayName,
                x.Type.ToString(),
                x.Status.ToString(),
                x.PackageFileName,
                x.PackageSizeBytes,
                x.PackageChecksumSha256,
                x.SelectedDomains,
                null,
                x.ErrorMessage,
                x.CreatedAt
            ))
            .ToListAsync(ct);

        var result = PagedResult<ProjectMigrationLogDto>.From(
            items: items,
            totalCount: total,
            page: page,
            pageSize: pageSize
        );

        await this.SendResultAsync(Result.Ok(result), ct);
    }
}
