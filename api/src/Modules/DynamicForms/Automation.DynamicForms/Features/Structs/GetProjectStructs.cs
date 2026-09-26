using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.DynamicForms.Constants;
using Automation.DynamicForms.Contracts;
using Automation.DynamicForms.Infrastructure.Persistence;

namespace Automation.DynamicForms.Features.Structs;

public record GetProjectStructsQuery(Guid ProjectId, string? Search = null);

public class GetProjectStructsEndpoint(IMessageBus bus)
    : Endpoint<GetProjectStructsQuery, IReadOnlyList<StructSummaryDto>>
{
    public override void Configure()
    {
        Get("");
        Group<StructsGroup>();
        Permissions(P.Structs.GetAll);
        Description(x => x.WithName("GetProjectStructs"));
    }

    public override async Task HandleAsync(GetProjectStructsQuery req, CancellationToken ct)
    {
        req = req with { ProjectId = Route<Guid>("projectId") };
        var result = await bus.InvokeAsync<Result<IReadOnlyList<StructSummaryDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetProjectStructsHandler(DynamicFormsDbContext db)
{
    public async Task<Result<IReadOnlyList<StructSummaryDto>>> HandleAsync(
        GetProjectStructsQuery query,
        CancellationToken ct)
    {
        var ownerId = query.ProjectId.ToString();

        var queryable = db.SchemaDefinitions
            .Include(s => s.Versions.Where(v => v.IsActive))
            .AsNoTracking()
            .Where(s => s.OwnerType == DynamicFormsOwnerType.ProjectStruct && s.OwnerId == ownerId);

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.Trim().ToLower();
            queryable = queryable.Where(s => s.Name.ToLower().Contains(search));
        }

        var schemas = await queryable
            .OrderBy(s => s.Name)
            .ToListAsync(ct);

        var result = new List<StructSummaryDto>();

        foreach (var schema in schemas)
        {
            var activeVersion = schema.Versions.FirstOrDefault(v => v.IsActive);
            var fieldCount = 0;
            var depIds = new List<Guid>();

            if (activeVersion != null)
            {
                depIds = activeVersion.DependencySchemaIds;
                if (activeVersion.Fields != null && activeVersion.Fields.RootElement.ValueKind == JsonValueKind.Array)
                {
                    fieldCount = activeVersion.Fields.RootElement.GetArrayLength();
                }
            }

            result.Add(new StructSummaryDto
            {
                Id = schema.Id,
                ProjectId = query.ProjectId,
                Name = schema.Name,
                ActiveVersion = activeVersion?.Version ?? 0,
                FieldCount = fieldCount,
                DependencySchemaIds = depIds,
                CreatedAt = schema.CreatedAt,
                UpdatedAt = schema.UpdatedAt
            });
        }

        return Result.Ok<IReadOnlyList<StructSummaryDto>>(result);
    }
}
