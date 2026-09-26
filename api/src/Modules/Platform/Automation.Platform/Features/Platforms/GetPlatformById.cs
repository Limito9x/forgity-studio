using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Files.Contracts;
using Automation.Platform.Constants;
using Automation.Platform.Infrastructure.Persistence;
using Automation.Platform.Shared.Dtos;

namespace Automation.Platform.Features.Platforms;

public record GetPlatformByIdQuery(Guid Id);

public class GetPlatformByIdEndpoint(IMessageBus bus) : EndpointWithoutRequest<PlatformDto>
{
    public override void Configure()
    {
        Get("/{id:guid}");
        Group<PlatformsGroup>();
        Permissions(P.Platform.GetById);
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var result = await bus.InvokeAsync<Result<PlatformDto>>(new GetPlatformByIdQuery(id), ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetPlatformByIdHandler(PlatformDbContext db, IAssetApi assetApi)
{
    public async Task<Result<PlatformDto>> HandleAsync(GetPlatformByIdQuery query, CancellationToken ct)
    {
        var platform = await db.Platforms
            .AsNoTracking()
            .Include(x => x.Extensions)
            .FirstOrDefaultAsync(x => x.Id == query.Id, ct);

        if (platform is null)
            return Result.Fail($"Platform with ID '{query.Id}' was not found.");

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

        var dto = new PlatformDto(
            platform.Id,
            platform.Key,
            platform.Name,
            platform.Extensions.Select(e => e.Extension).ToList(),
            platform.CreatedAt,
            iconAssetId,
            iconUrl
        );

        return Result.Ok(dto);
    }
}
