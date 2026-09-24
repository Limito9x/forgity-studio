using Wolverine.Attributes;
using Automation.Tag.Contracts.Dtos;
using Automation.Tag.Contracts;

namespace Automation.Tag.Features.TagLinks;

public record GetTagLinksQuery(string EntityType, Guid EntityId);

public class GetTagLinksEndpoint(IMessageBus bus) : Endpoint<GetTagLinksQuery, IReadOnlyList<TagLinkDetailDto>>
{
    public override void Configure()
    {
        Get("");
        Group<TagLinksGroup>();
        Permissions(P.TagLink.GetAll);
    }

    public override async Task HandleAsync(GetTagLinksQuery query, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<IReadOnlyList<TagLinkDetailDto>>>(query, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetTagLinksHandler(ITagApi tagApi)
{
    public async Task<Result<IReadOnlyList<TagLinkDetailDto>>> HandleAsync(GetTagLinksQuery query, CancellationToken ct)
    {
        return await tagApi.GetTagsByEntityAsync(query.EntityType, query.EntityId, ct);
    }
}
