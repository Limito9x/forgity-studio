using FastEndpoints;
using FluentResults;
using Wolverine;
using Wolverine.Attributes;
using Automation.Content.Constants;
using Automation.Content.Contracts;
using Automation.SharedKernel.Extensions.Results;

namespace Automation.Content.Features.ContentItems;

public record GetContentAnchorTreeQuery
{
    public Guid Id { get; set; }
}

public class GetContentAnchorTreeEndpoint(IMessageBus bus)
    : Endpoint<GetContentAnchorTreeQuery, ContentAnchorTreeDto>
{
    public override void Configure()
    {
        Get(ContentRoutes.ContentAnchorTree);
        Group<ContentItemsGroup>();
        Permissions(P.ContentItem.GetById);
        Description(x => x.WithName("GetContentAnchorTree"));
    }

    public override async Task HandleAsync(
        GetContentAnchorTreeQuery req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<ContentAnchorTreeDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetContentAnchorTreeHandler(IContentApi contentApi)
{
    public async Task<Result<ContentAnchorTreeDto>> HandleAsync(
        GetContentAnchorTreeQuery query,
        CancellationToken ct)
    {
        return await contentApi.GetContentAnchorTreeAsync(query.Id, ct);
    }
}

