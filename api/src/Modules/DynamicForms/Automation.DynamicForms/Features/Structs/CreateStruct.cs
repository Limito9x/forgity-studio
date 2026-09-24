using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.DynamicForms.Constants;
using Automation.DynamicForms.Contracts;
using Automation.DynamicForms.Domain.Entities;
using Automation.DynamicForms.Infrastructure.Persistence;
using Automation.DynamicForms.Services;
using Automation.SharedKernel.Domain.Entities;

namespace Automation.DynamicForms.Features.Structs;

public record CreateStructCommand(Guid ProjectId, string Name, JsonDocument? Fields = null);

public class CreateStructValidator : AbstractValidator<CreateStructCommand>
{
    public CreateStructValidator()
    {
        RuleFor(x => x.ProjectId)
            .NotEmpty();

        RuleFor(x => x.Name)
            .NotEmpty()
            .MinimumLength(2)
            .MaximumLength(100)
            .Matches(@"^[a-zA-Z0-9_\s-]+$")
            .WithMessage("Name can only contain alphanumeric characters, spaces, underscores, and hyphens.");
    }
}

public class CreateStructEndpoint(IMessageBus bus)
    : Endpoint<CreateStructCommand, StructDetailDto>
{
    public override void Configure()
    {
        Post("");
        Group<StructsGroup>();
        Permissions(P.Structs.Create);
        Description(x => x.WithName("CreateStruct"));
    }

    public override async Task HandleAsync(CreateStructCommand req, CancellationToken ct)
    {
        req = req with { ProjectId = Route<Guid>("projectId") };
        var result = await bus.InvokeAsync<Result<StructDetailDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(DynamicFormsDbContext))]
public class CreateStructHandler(DynamicFormsDbContext db)
{
    public async Task<Result<StructDetailDto>> HandleAsync(
        CreateStructCommand command,
        CancellationToken ct)
    {
        var ownerId = command.ProjectId.ToString();
        var trimmedName = command.Name.Trim();

        var exists = await db.SchemaDefinitions
            .AnyAsync(s => s.OwnerType == DynamicFormsOwnerType.ProjectStruct &&
                           s.OwnerId == ownerId &&
                           s.Name.ToLower() == trimmedName.ToLower(), ct);

        if (exists)
        {
            return Result.Fail(new Error($"Struct with name '{trimmedName}' already exists in this project."));
        }

        var schemaId = IdGenerator.NewId();
        var fields = command.Fields ?? JsonDocument.Parse("[]");
        var directStructIds = StructDependencyHelper.ExtractDirectStructIds(fields);
        List<Guid> transitiveDependencies = [];
        var dependenciesDict = new Dictionary<Guid, SchemaVersionDto>();

        if (directStructIds.Count > 0)
        {
            async Task<IEnumerable<Guid>?> GetChildDependenciesFunc(Guid childId, CancellationToken token)
            {
                var childVersion = await db.SchemaVersions
                    .AsNoTracking()
                    .FirstOrDefaultAsync(v => v.SchemaDefinitionId == childId && v.IsActive, token);
                return childVersion?.DependencySchemaIds;
            }

            var depResult = await StructDependencyHelper.ComputeTransitiveDependenciesAsync(
                schemaId, directStructIds, GetChildDependenciesFunc, ct);

            if (depResult.IsFailed)
            {
                return depResult.ToResult<StructDetailDto>();
            }

            transitiveDependencies = depResult.Value;

            if (transitiveDependencies.Count > 0)
            {
                var depSchemas = await db.SchemaDefinitions
                    .Include(s => s.Versions.Where(v => v.IsActive))
                    .AsNoTracking()
                    .Where(s => transitiveDependencies.Contains(s.Id))
                    .ToListAsync(ct);

                foreach (var dep in depSchemas)
                {
                    var depActiveVersion = dep.Versions.FirstOrDefault(v => v.IsActive);
                    if (depActiveVersion != null)
                    {
                        dependenciesDict[dep.Id] = new SchemaVersionDto
                        {
                            Id = depActiveVersion.Id,
                            SchemaDefinitionId = dep.Id,
                            Fields = depActiveVersion.Fields,
                            Version = depActiveVersion.Version,
                            IsActive = depActiveVersion.IsActive,
                            DependencySchemaIds = depActiveVersion.DependencySchemaIds
                        };
                    }
                }
            }
        }

        var schema = new SchemaDefinition(trimmedName, ownerId, DynamicFormsOwnerType.ProjectStruct)
        {
            Id = schemaId
        };
        db.SchemaDefinitions.Add(schema);

        var version = new SchemaVersion(schema.Id, fields, 1, true)
        {
            DependencySchemaIds = transitiveDependencies
        };
        db.SchemaVersions.Add(version);

        await db.SaveChangesAsync(ct);

        return Result.Ok(new StructDetailDto
        {
            Id = schema.Id,
            ProjectId = command.ProjectId,
            Name = schema.Name,
            ActiveVersion = new SchemaVersionDto
            {
                Id = version.Id,
                SchemaDefinitionId = schema.Id,
                Fields = version.Fields,
                Version = version.Version,
                IsActive = version.IsActive,
                DependencySchemaIds = version.DependencySchemaIds
            },
            Dependencies = dependenciesDict,
            CreatedAt = schema.CreatedAt,
            UpdatedAt = schema.UpdatedAt
        });
    }
}
