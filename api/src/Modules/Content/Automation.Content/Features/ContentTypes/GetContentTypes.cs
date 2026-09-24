using Wolverine.Attributes;
using Automation.Content.Constants;
using Automation.Content.Domain.Entities;
using Automation.Content.Infrastructure.Persistence;
using Automation.Content.Shared.Dtos;
using Automation.DynamicForms.Contracts;
using Gridify;

namespace Automation.Content.Features.ContentTypes;

public class GetContentTypesQuery : PagedQuery
{
    public Guid ProjectId { get; set; }
}

public class GetContentTypesEndpoint(IMessageBus bus)
    : Endpoint<GetContentTypesQuery, PagedResult<ContentTypeDto>>
{
    public override void Configure()
    {
        Get(ContentRoutes.NestedContentTypes);
        Group<ContentTypesGroup>();
        Permissions(P.ContentType.GetAll);
        Description(x => x.WithName("GetContentTypes"));
    }

    public override async Task HandleAsync(
        GetContentTypesQuery req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<PagedResult<ContentTypeDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetContentTypesHandler(ContentDbContext db, ISchemaApi schemaApi)
{
    public async Task<Result<PagedResult<ContentTypeDto>>> HandleAsync(
        GetContentTypesQuery query,
        CancellationToken ct)
    {
        var mapper = new GridifyMapper<ContentType>()
            .GenerateMappings();

        var queryable = db.Set<ContentType>().AsQueryable();
        
        if (query.ProjectId != Guid.Empty)
        {
            queryable = queryable.Where(x => x.ProjectId == query.ProjectId);
        }

        var result = await queryable
            .ToPagedResultAsync<ContentType, ContentTypeDto>(query, mapper, ct);

        if (result.IsSuccess)
        {
            // Fetch schema for each content type (MVP N+1 approach)
            foreach (var item in result.Value.Items)
            {
                var schemaResult = await schemaApi.GetActiveVersionAsync("ContentType", item.Id.ToString(), ct);
                if (schemaResult.IsSuccess)
                {
                    item.FieldsConfig = schemaResult.Value.Fields;
                }
            }
        }
            
        return result;
    }
}
