using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.DynamicForms.Constants;
using Automation.DynamicForms.Contracts;
using Automation.DynamicForms.Infrastructure.Persistence;

namespace Automation.DynamicForms.Features.Structs;

public record GetStructByIdQuery(Guid ProjectId, Guid Id);

public class GetStructByIdEndpoint(IMessageBus bus)
    : Endpoint<GetStructByIdQuery, StructDetailDto>
{
    public override void Configure()
    {
        Get("{id:guid}");
        Group<StructsGroup>();
        Permissions(P.Structs.GetById);
        Description(x => x.WithName("GetStructById"));
    }

    public override async Task HandleAsync(GetStructByIdQuery req, CancellationToken ct)
    {
        req = req with { Id = Route<Guid>("id"), ProjectId = Route<Guid>("projectId") };
        var result = await bus.InvokeAsync<Result<StructDetailDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetStructByIdHandler(DynamicFormsDbContext db, ISchemaApi schemaApi)
{
    public async Task<Result<StructDetailDto>> HandleAsync(
        GetStructByIdQuery query,
        CancellationToken ct)
    {
        var schemaResult = await schemaApi.GetActiveVersionWithDependenciesAsync(query.Id, ct);
        if (schemaResult.IsFailed)
            return schemaResult.ToResult<StructDetailDto>();

        var schema = schemaResult.Value;
        if (schema.OwnerType != DynamicFormsOwnerType.ProjectStruct || schema.OwnerId != query.ProjectId.ToString())
        {
            return Result.Fail(new NotFoundError($"Struct with id '{query.Id}' not found in this project"));
        }

        var schemaEntity = await db.SchemaDefinitions.AsNoTracking().FirstOrDefaultAsync(s => s.Id == query.Id, ct);

        return Result.Ok(new StructDetailDto
        {
            Id = schema.SchemaDefinitionId,
            ProjectId = query.ProjectId,
            Name = schema.Name,
            ActiveVersion = schema.ActiveVersion,
            Dependencies = schema.Dependencies,
            CreatedAt = schemaEntity?.CreatedAt ?? DateTimeOffset.UtcNow,
            UpdatedAt = schemaEntity?.UpdatedAt
        });
    }
}
