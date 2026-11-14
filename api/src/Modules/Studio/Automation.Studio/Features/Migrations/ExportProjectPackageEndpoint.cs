using Automation.Studio.Features.Migrations.Dtos;
using Automation.Studio.Features.Migrations.Services;
using Automation.Studio.Features.Projects;

namespace Automation.Studio.Features.Migrations;

public class ExportProjectPackageRequestModel
{
    public Guid Id { get; set; }
    public List<string>? Domains { get; set; }
}

public class ExportProjectPackageEndpoint(ProjectMigrationOrchestrator orchestrator)
    : Endpoint<ExportProjectPackageRequestModel>
{
    public override void Configure()
    {
        Post("/{id:guid}/migrations/export");
        Group<ProjectsGroup>();
        Permissions(P.Project.GetById);
        Description(x => x.WithName("ExportProjectPackage"));
    }

    public override async Task HandleAsync(ExportProjectPackageRequestModel req, CancellationToken ct)
    {
        var result = await orchestrator.ExportPackageAsync(req.Id, req.Domains, ct);
        if (result.IsFailed)
        {
            await this.SendResultAsync(result.ToResult(), ct);
            return;
        }

        var (bytes, fileName) = result.Value;
        HttpContext.Response.ContentType = "application/zip";
        HttpContext.Response.Headers.Append("Content-Disposition", $"attachment; filename=\"{fileName}\"");
        await HttpContext.Response.Body.WriteAsync(bytes, ct);
    }
}
