using Automation.Studio.Features.Migrations.Domain;
using Automation.Studio.Features.Migrations.Dtos;
using Automation.Studio.Features.Migrations.Services;
using Automation.Studio.Features.Projects;

namespace Automation.Studio.Features.Migrations;

public class ImportProjectPackageRequestModel
{
    public Guid Id { get; set; }
    public IFormFile File { get; set; } = default!;
    public ConflictResolutionStrategy Strategy { get; set; } = ConflictResolutionStrategy.Overwrite;
}

public class ImportProjectPackageEndpoint(ProjectMigrationOrchestrator orchestrator)
    : Endpoint<ImportProjectPackageRequestModel, ImportProjectPackageResultDto>
{
    public override void Configure()
    {
        Post("/{id:guid}/migrations/import");
        Group<ProjectsGroup>();
        AllowFileUploads();
        Permissions(P.Project.Update);
        Description(x => x.WithName("ImportProjectPackage"));
    }

    public override async Task HandleAsync(ImportProjectPackageRequestModel req, CancellationToken ct)
    {
        if (req.File == null || req.File.Length == 0)
        {
            ThrowError("No package file was provided.");
        }

        using var stream = req.File.OpenReadStream();
        var result = await orchestrator.ImportPackageAsync(
            projectId: req.Id,
            packageStream: stream,
            fileName: req.File.FileName,
            strategy: req.Strategy,
            ct: ct
        );

        await this.SendResultAsync(result, ct);
    }
}
