using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.DynamicForms.Constants;
using Automation.DynamicForms.Contracts;
using Automation.DynamicForms.Domain.Entities;
using Automation.DynamicForms.Infrastructure.Persistence;
using Automation.DynamicForms.Services;

namespace Automation.DynamicForms.Features.Structs;

public record UpdateStructCommand(Guid ProjectId, Guid Id, string Name, JsonDocument? Fields = null);

public class UpdateStructValidator : AbstractValidator<UpdateStructCommand>
{
    public UpdateStructValidator()
    {
        RuleFor(x => x.ProjectId)
            .NotEmpty();

        RuleFor(x => x.Id)
            .NotEmpty();

        RuleFor(x => x.Name)
            .NotEmpty()
            .MinimumLength(2)
            .MaximumLength(100)
            .Matches(@"^[a-zA-Z0-9_\s-]+$")
            .WithMessage("Name can only contain alphanumeric characters, spaces, underscores, and hyphens.");
    }
}

public class UpdateStructEndpoint(IMessageBus bus)
    : Endpoint<UpdateStructCommand, StructDetailDto>
{
    public override void Configure()
    {
        Put("{id:guid}");
        Group<StructsGroup>();
        Permissions(P.Structs.Update);
        Description(x => x.WithName("UpdateStruct"));
    }

    public override async Task HandleAsync(UpdateStructCommand req, CancellationToken ct)
    {
        req = req with { Id = Route<Guid>("id"), ProjectId = Route<Guid>("projectId") };
        var result = await bus.InvokeAsync<Result<StructDetailDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(DynamicFormsDbContext))]
public class UpdateStructHandler(DynamicFormsDbContext db)
{
    public async Task<Result<StructDetailDto>> HandleAsync(
        UpdateStructCommand command,
        CancellationToken ct)
    {
        var ownerId = command.ProjectId.ToString();
        var trimmedName = command.Name.Trim();

        var schema = await db.SchemaDefinitions
            .Include(s => s.Versions)
            .FirstOrDefaultAsync(s => s.Id == command.Id &&
                                      s.OwnerType == DynamicFormsOwnerType.ProjectStruct &&
                                      s.OwnerId == ownerId, ct);

        if (schema == null)
        {
            return Result.Fail(new NotFoundError($"Struct with id '{command.Id}' not found in this project."));
        }

        // Check if new name conflicts with another struct in the project
        if (!string.Equals(schema.Name, trimmedName, StringComparison.OrdinalIgnoreCase))
        {
            var exists = await db.SchemaDefinitions
                .AnyAsync(s => s.Id != command.Id &&
                               s.OwnerType == DynamicFormsOwnerType.ProjectStruct &&
                               s.OwnerId == ownerId &&
                               s.Name.ToLower() == trimmedName.ToLower(), ct);

            if (exists)
            {
                return Result.Fail(new Error($"Struct with name '{trimmedName}' already exists in this project."));
            }
        }

        var activeVersion = schema.Versions.FirstOrDefault(v => v.IsActive);
        var fields = command.Fields ?? activeVersion?.Fields ?? JsonDocument.Parse("[]");

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
                schema.Id, directStructIds, GetChildDependenciesFunc, ct);

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

        schema.Name = trimmedName;

        SchemaVersion currentActive;
        if (activeVersion == null)
        {
            currentActive = new SchemaVersion(schema.Id, fields, 1, true)
            {
                DependencySchemaIds = transitiveDependencies
            };
            db.SchemaVersions.Add(currentActive);
        }
        else
        {
            var fieldsChanged = JsonSerializer.Serialize(activeVersion.Fields) != JsonSerializer.Serialize(fields);
            if (fieldsChanged)
            {
                activeVersion.Deactivate();
                var nextVersionNumber = schema.Versions.Any() ? schema.Versions.Max(v => v.Version) + 1 : 1;
                currentActive = new SchemaVersion(schema.Id, fields, nextVersionNumber, true)
                {
                    DependencySchemaIds = transitiveDependencies
                };
                db.SchemaVersions.Add(currentActive);
            }
            else
            {
                activeVersion.DependencySchemaIds = transitiveDependencies;
                currentActive = activeVersion;
            }
        }

        await db.SaveChangesAsync(ct);

        return Result.Ok(new StructDetailDto
        {
            Id = schema.Id,
            ProjectId = command.ProjectId,
            Name = schema.Name,
            ActiveVersion = new SchemaVersionDto
            {
                Id = currentActive.Id,
                SchemaDefinitionId = schema.Id,
                Fields = currentActive.Fields,
                Version = currentActive.Version,
                IsActive = currentActive.IsActive,
                DependencySchemaIds = currentActive.DependencySchemaIds
            },
            Dependencies = dependenciesDict,
            CreatedAt = schema.CreatedAt,
            UpdatedAt = schema.UpdatedAt
        });
    }
}
