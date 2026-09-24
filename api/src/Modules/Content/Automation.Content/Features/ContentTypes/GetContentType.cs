using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Content.Constants;
using Automation.Content.Domain.Entities;
using Automation.Content.Infrastructure.Persistence;
using Automation.Content.Shared.Dtos;
using Automation.DynamicForms.Contracts;

namespace Automation.Content.Features.ContentTypes;

public record GetContentTypeQuery(
    Guid ProjectId,
    string Key);

public class GetContentTypeEndpoint(IMessageBus bus)
    : Endpoint<GetContentTypeQuery, ContentTypeDto>
{
    public override void Configure()
    {
        Get(ContentRoutes.NestedContentTypes + "/{key}");
        Group<ContentTypesGroup>();
        Permissions(P.ContentType.GetById);
        Description(x => x.WithName("GetContentType"));
    }

    public override async Task HandleAsync(
        GetContentTypeQuery req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<ContentTypeDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetContentTypeHandler(ContentDbContext db, ISchemaApi schemaApi)
{
    public async Task<Result<ContentTypeDto>> HandleAsync(
        GetContentTypeQuery query,
        CancellationToken ct)
    {
        ContentType? contentType = null;
        if(Guid.TryParse(query.Key, out var id))
        {
            contentType = await db.ContentTypes.FirstOrDefaultAsync(x => x.Id == id && x.ProjectId == query.ProjectId, ct);
        }
        else
        {
            contentType = await db.ContentTypes.FirstOrDefaultAsync(x 
            => x.Key == query.Key && x.ProjectId == query.ProjectId, ct);
        }
        
        if (contentType is null) return Result.Fail(new NotFoundError("ContentType not found"));
        
        var schemaResult = await schemaApi.GetActiveVersionWithDependenciesAsync("ContentType", contentType.Id.ToString(), ct);

        return Result.Ok(new ContentTypeDto
        {
            Id = contentType.Id,
            ProjectId = contentType.ProjectId,
            Key = contentType.Key,
            Name = contentType.Name,
            DisplayName = contentType.DisplayName,
            Description = contentType.Description,
            Icon = contentType.Icon,
            Color = contentType.Color,
            SortOrder = contentType.SortOrder,
            FieldsConfig = schemaResult.IsSuccess ? schemaResult.Value.ActiveVersion?.Fields : null,
            DisplayConfig = contentType.DisplayConfig,
            Dependencies = schemaResult.IsSuccess ? schemaResult.Value.Dependencies : []
        });
    }
}
