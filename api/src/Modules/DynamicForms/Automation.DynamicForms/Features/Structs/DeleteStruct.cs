using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.DynamicForms.Constants;
using Automation.DynamicForms.Contracts;
using Automation.DynamicForms.Infrastructure.Persistence;

namespace Automation.DynamicForms.Features.Structs;

public record DeleteStructCommand(Guid ProjectId, Guid Id);

public class DeleteStructEndpoint(IMessageBus bus)
    : Endpoint<DeleteStructCommand>
{
    public override void Configure()
    {
        Delete("{id:guid}");
        Group<StructsGroup>();
        Permissions(P.Structs.Delete);
        Description(x => x.WithName("DeleteStruct"));
    }

    public override async Task HandleAsync(DeleteStructCommand req, CancellationToken ct)
    {
        req = req with { Id = Route<Guid>("id"), ProjectId = Route<Guid>("projectId") };
        var result = await bus.InvokeAsync<Result>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(DynamicFormsDbContext))]
public class DeleteStructHandler(DynamicFormsDbContext db, ISchemaApi schemaApi)
{
    public async Task<Result> HandleAsync(
        DeleteStructCommand command,
        CancellationToken ct)
    {
        var ownerId = command.ProjectId.ToString();

        var schema = await db.SchemaDefinitions
            .FirstOrDefaultAsync(s => s.Id == command.Id &&
                                      s.OwnerType == DynamicFormsOwnerType.ProjectStruct &&
                                      s.OwnerId == ownerId, ct);

        if (schema == null)
        {
            return Result.Fail(new NotFoundError($"Struct with id '{command.Id}' not found in this project."));
        }

        // Referential Integrity Check: Verify no active schema references this struct
        var referencingResult = await schemaApi.GetReferencingSchemasAsync(command.Id, ct);
        if (referencingResult.IsSuccess && referencingResult.Value.Count > 0)
        {
            var usageDescriptions = string.Join(", ", referencingResult.Value.Select(u => $"'{u.Name}' ({u.OwnerType})"));
            return Result.Fail(new Error($"Cannot delete Struct '{schema.Name}' because it is referenced by: {usageDescriptions}."));
        }

        db.SchemaDefinitions.Remove(schema);
        await db.SaveChangesAsync(ct);

        return Result.Ok();
    }
}
