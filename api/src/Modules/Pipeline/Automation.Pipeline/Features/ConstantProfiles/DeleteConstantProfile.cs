using Automation.Pipeline.Infrastructure.Persistence;
using FastEndpoints;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.ConstantProfiles;

public class DeleteConstantProfileEndpoint(PipelineDbContext db)
    : EndpointWithoutRequest
{
    public override void Configure()
    {
        Delete("{id:guid}");
        Group<ConstantProfilesGroup>();
        Description(b => b.WithSummary("Delete a constant profile by id"));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var entity = await db.ConstantProfiles.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (entity is null)
        {
            await Send.NotFoundAsync(ct);
            return;
        }

        db.ConstantProfiles.Remove(entity);
        await db.SaveChangesAsync(ct);
        await Send.NoContentAsync(ct);
    }
}
