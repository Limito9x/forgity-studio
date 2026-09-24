using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Projects.Infrastructure.Persistence;
using Automation.Projects.Shared.Dtos;

namespace Automation.Projects.Features.Studios;

public record GetStudioByIdQuery(Guid Id);

public class GetStudioByIdEndpoint(IMessageBus bus)
    : Endpoint<GetStudioByIdQuery, StudioDto>
{
    public override void Configure()
    {
        Get("/{id:guid}");
        Group<StudiosGroup>();
        Permissions(P.Studio.GetById);
        Description(x => x.WithName("GetStudioById"));
    }

    public override async Task HandleAsync(GetStudioByIdQuery req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<StudioDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetStudioByIdHandler(ProjectsDbContext db)
{
    public async Task<Result<StudioDto>> HandleAsync(
        GetStudioByIdQuery query,
        CancellationToken ct)
    {
        var studio = await db.Studios.FirstOrDefaultAsync(x => x.Id == query.Id, ct);
        if (studio is null)
        {
            return Result.Fail(new NotFoundError("Studio not found"));
        }

        return Result.Ok(studio.Adapt<StudioDto>());
    }
}
