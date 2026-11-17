using System.Security.Claims;
using System.Text.Json;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Infrastructure.Persistence;
using FastEndpoints;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Features.ConstantProfiles;

public record UpsertConstantProfileRequest(
    Guid? Id,
    Guid? RunnerId,
    string Name,
    JsonDocument ValuesJson
);

public class UpsertConstantProfileEndpoint(PipelineDbContext db)
    : Endpoint<UpsertConstantProfileRequest, ConstantProfileDto>
{
    public override void Configure()
    {
        Post("");
        Group<ConstantProfilesGroup>();
        Description(b => b.WithSummary("Create or update a constant profile"));
    }

    public override async Task HandleAsync(UpsertConstantProfileRequest req, CancellationToken ct)
    {
        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        var ownerUserId = Guid.TryParse(userIdStr, out var parsed) ? parsed : Guid.Empty;

        ConstantProfile? entity = null;
        if (req.Id.HasValue)
        {
            entity = await db.ConstantProfiles.FirstOrDefaultAsync(x => x.Id == req.Id.Value, ct);
        }

        if (entity is null)
        {
            entity = new ConstantProfile
            {
                OwnerUserId = ownerUserId,
                RunnerId = req.RunnerId,
                Name = req.Name.Trim(),
                ValuesJson = req.ValuesJson,
            };
            db.ConstantProfiles.Add(entity);
        }
        else
        {
            entity.RunnerId = req.RunnerId;
            entity.Name = req.Name.Trim();
            entity.ValuesJson = req.ValuesJson;
        }

        await db.SaveChangesAsync(ct);

        await Send.OkAsync(new ConstantProfileDto(
            entity.Id,
            entity.OwnerUserId,
            entity.RunnerId,
            entity.Name,
            entity.ValuesJson
        ), ct);
    }
}
