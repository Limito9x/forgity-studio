using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Files.Contracts;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.BuildTime.Features.CustomNodes;

public record GetCustomNodeSourceQuery(Guid Id);

public record CustomNodeSourceResponseDto(
    Guid Id,
    string Key,
    string Name,
    string? FileName,
    string Content,
    string? ContentHash,
    string Executor
);

public class GetCustomNodeSourceEndpoint(IMessageBus bus)
    : EndpointWithoutRequest<CustomNodeSourceResponseDto>
{
    public override void Configure()
    {
        Get("custom/{Id:guid}/source");
        Group<NodesGroup>();
        Description(x => x.WithName("GetCustomNodeSource"));
        Permissions(P.Pipeline.GetById);
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("Id");
        var query = new GetCustomNodeSourceQuery(id);
        var result = await bus.InvokeAsync<Result<CustomNodeSourceResponseDto>>(query, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetCustomNodeSourceHandler(
    PipelineDbContext db,
    IAssetApi assets,
    IHttpClientFactory httpClientFactory,
    ILogger<GetCustomNodeSourceHandler> logger
)
{
    public async Task<Result<CustomNodeSourceResponseDto>> HandleAsync(
        GetCustomNodeSourceQuery query,
        CancellationToken ct
    )
    {
        var node = await db.NodeDefinitions
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == query.Id, ct);

        if (node == null)
        {
            return Result.Fail<CustomNodeSourceResponseDto>("Custom node not found.");
        }

        var found = await assets.GetFilesAsync(node.Id.ToString(), "NodeDefinition", Constants.PipelineAssetSlots.CustomScript, ct);
        if (found.IsFailed) return Result.Fail<CustomNodeSourceResponseDto>(found.Errors);

        var file = found.Value.SingleOrDefault();
        if (file == null)
        {
            return Result.Fail<CustomNodeSourceResponseDto>("No script file associated with this custom node.");
        }

        string content = string.Empty;
        if (!string.IsNullOrWhiteSpace(file.PublicUrl))
        {
            try
            {
                var client = httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(10);
                content = await client.GetStringAsync(file.PublicUrl, ct);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to read script content from PublicUrl {Url}", file.PublicUrl);
                return Result.Fail<CustomNodeSourceResponseDto>("Failed to load script content from storage.");
            }
        }

        return Result.Ok(new CustomNodeSourceResponseDto(
            node.Id,
            node.Key,
            node.Name,
            file.OriginalName,
            content,
            node.ContentHash ?? file.HashSha256,
            node.Executor
        ));
    }
}

