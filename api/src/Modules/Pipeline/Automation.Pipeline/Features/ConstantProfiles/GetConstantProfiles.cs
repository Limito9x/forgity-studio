using System.Security.Claims;
using System.Text.Json;
using Automation.Pipeline.Infrastructure.Persistence;
using FastEndpoints;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.ConstantProfiles;

public record ConstantProfileDto(
    Guid Id,
    Guid OwnerUserId,
    Guid? RunnerId,
    string Name,
    JsonDocument ValuesJson
);

public class GetConstantProfilesEndpoint(PipelineDbContext db)
    : EndpointWithoutRequest<List<ConstantProfileDto>>
{
    public override void Configure()
    {
        Get("");
        Group<ConstantProfilesGroup>();
        Description(b => b.WithSummary("Get constant profiles for the current user"));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        var ownerUserId = Guid.TryParse(userIdStr, out var parsed) ? parsed : Guid.Empty;

        var items = await db.ConstantProfiles
            .AsNoTracking()
            .Where(x => ownerUserId == Guid.Empty || x.OwnerUserId == ownerUserId)
            .OrderByDescending(x => x.UpdatedAt)
            .Select(x => new ConstantProfileDto(x.Id, x.OwnerUserId, x.RunnerId, x.Name, x.ValuesJson))
            .ToListAsync(ct);

        await Send.OkAsync(items, ct);
    }
}
