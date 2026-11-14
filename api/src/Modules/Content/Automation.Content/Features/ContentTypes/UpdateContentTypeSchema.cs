using System.Text.Json.Serialization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Content.Constants;
using Automation.Content.Infrastructure.Persistence;
using Automation.DynamicForms.Contracts;

namespace Automation.Content.Features.ContentTypes;

public record UpdateContentTypeSchemaCommand{
    public Guid Id { get; set; }
    
    public JsonDocument? FieldsConfig { get; set; }
};

public class UpdateContentTypeSchemaEndpoint(IMessageBus bus)
    : Endpoint<UpdateContentTypeSchemaCommand>
{
    public override void Configure()
    {
        Put(ContentRoutes.ContentType + "/schema");
        Group<ContentTypesGroup>();
        Permissions(P.ContentType.Update);
        Description(x => x.WithName("UpdateContentTypeSchema"));
    }

    public override async Task HandleAsync(
        UpdateContentTypeSchemaCommand req,
        CancellationToken ct)
    {
        req = req with { Id = Route<Guid>("Id") };
        var result = await bus.InvokeAsync<Result>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(ContentDbContext))]
public class UpdateContentTypeSchemaHandler(ContentDbContext db, ISchemaApi schemaApi)
{
    public async Task<Result> HandleAsync(
        UpdateContentTypeSchemaCommand request,
        CancellationToken cancellationToken)
    {
        var item = await db.ContentTypes.FirstOrDefaultAsync(x => x.Id == request.Id, cancellationToken);
        if (item is null) return Result.Fail(new NotFoundError("ContentType not found"));
        
        var schemaResult = await schemaApi.UpsertSchemaAsync(
            "ContentType", 
            item.Id.ToString(), 
            item.Name, 
            request.FieldsConfig, 
            cancellationToken);

        return schemaResult;
    }
}
