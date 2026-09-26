using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Files.Contracts;
using Automation.Platform.Constants;
using Automation.Platform.Infrastructure.Persistence;
using Automation.Platform.Shared.Dtos;

namespace Automation.Platform.Features.Platforms;

public record GetPlatformsQuery;

public class GetPlatformsEndpoint(IMessageBus bus) : EndpointWithoutRequest<IReadOnlyList<PlatformDto>>
{
    public override void Configure()
    {
        Get("/");
        Group<PlatformsGroup>();
        Permissions(P.Platform.GetAll);
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<IReadOnlyList<PlatformDto>>>(new GetPlatformsQuery(), ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetPlatformsHandler(PlatformDbContext db, IAssetApi assetApi)
{
    public async Task<Result<IReadOnlyList<PlatformDto>>> HandleAsync(GetPlatformsQuery query, CancellationToken ct)
    {
        var platforms = await db.Platforms
            .AsNoTracking()
            .Include(x => x.Extensions)
            .OrderBy(x => x.Name)
            .ToListAsync(ct);

        var resultList = new List<PlatformDto>();
        foreach (var platform in platforms)
        {
            Guid? iconAssetId = null;
            string? iconUrl = null;
            var filesRes = await assetApi.GetFilesAsync(platform.Id.ToString(), "Platform", PlatformAssetSlots.Icon, ct);
            if (filesRes.IsSuccess)
            {
                var firstFile = filesRes.Value.FirstOrDefault();
                if (firstFile != null)
                {
                    iconAssetId = firstFile.AssetId;
                    iconUrl = firstFile.PublicUrl;
                }
            }

            resultList.Add(new PlatformDto(
                platform.Id,
                platform.Key,
                platform.Name,
                platform.Extensions.Select(e => e.Extension).ToList(),
                platform.CreatedAt,
                iconAssetId,
                iconUrl
            ));
        }

        return Result.Ok<IReadOnlyList<PlatformDto>>(resultList);
    }
}
