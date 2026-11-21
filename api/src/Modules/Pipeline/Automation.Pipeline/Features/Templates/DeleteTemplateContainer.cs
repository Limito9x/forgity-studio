using Automation.Pipeline.Infrastructure.Persistence;
using FastEndpoints;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.Templates;

public record DeleteTemplateContainerResponse(
    bool Deleted,
    bool Archived,
    string Message
);

public class DeleteTemplateContainerEndpoint(PipelineDbContext db)
    : EndpointWithoutRequest<DeleteTemplateContainerResponse>
{
    public override void Configure()
    {
        Delete("containers/{id:guid}");
        Group<TemplatesGroup>();
        Permissions(Constants.PipelinePermissions.Pipeline.Delete);
        Description(b =>
            b.WithSummary("Smart remove a template container (hard delete if unused, or archive if users forked it)")
        );
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var force = Query<bool>("force", isRequired: false);

        var pkg = await db.TemplatePackages
            .Include(t => t.Members)
            .FirstOrDefaultAsync(t => t.Id == id, ct);

        if (pkg is null)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        var hasLibraryUsers = await db.TemplateLibraryItems
            .AnyAsync(x => x.TemplatePackageId == id, ct);

        if (!hasLibraryUsers || force)
        {
            if (hasLibraryUsers)
            {
                var libItems = await db.TemplateLibraryItems
                    .Where(x => x.TemplatePackageId == id)
                    .ToListAsync(ct);
                db.TemplateLibraryItems.RemoveRange(libItems);
            }

            db.TemplatePackageMembers.RemoveRange(pkg.Members);
            db.TemplatePackages.Remove(pkg);
            await db.SaveChangesAsync(ct);

            await Send.OkAsync(
                new DeleteTemplateContainerResponse(
                    Deleted: true,
                    Archived: false,
                    Message: "Template container permanently deleted."
                ),
                ct
            );
            return;
        }

        pkg.IsPublic = false;
        pkg.ArchivedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);

        await Send.OkAsync(
            new DeleteTemplateContainerResponse(
                Deleted: false,
                Archived: true,
                Message: "Template has active users; unpublished and archived from catalog."
            ),
            ct
        );
    }
}
