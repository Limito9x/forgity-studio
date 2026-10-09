using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Studio.Infrastructure.Persistence;
using Automation.Studio.Shared.Dtos;

namespace Automation.Studio.Features.Studios;

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
public class GetStudioByIdHandler(StudioDbContext db, ICurrentUserProvider userProvider)
{
    public async Task<Result<StudioDto>> HandleAsync(
        GetStudioByIdQuery query,
        CancellationToken ct)
    {
        if (!userProvider.UserId.HasValue)
        {
            return Result.Fail(new UnauthorizedError("User is not authenticated"));
        }

        var userId = userProvider.UserId.Value;
        var userIdStr = userId.ToString();

        var studio = await db.Studios
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == query.Id && 
                (s.CreatedBy == userIdStr || s.Projects.Any(p => p.OwnerId == userId || db.ProjectMembers.Any(pm => pm.ProjectId == p.Id && pm.UserId == userId))), ct);

        if (studio is null)
        {
            return Result.Fail(new NotFoundError("Studio not found"));
        }

        return Result.Ok(studio.Adapt<StudioDto>());
    }
}
