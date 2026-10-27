using System.Text.Json;
using System.Text.Json.Serialization;
using Automation.Pipeline.Domain.ValueObjects;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Automation.Pipeline.Infrastructure.Persistence.Configurations;

public class NodeDefinitionConfiguration : IEntityTypeConfiguration<Domain.Entities.NodeDefinition>
{
    public void Configure(EntityTypeBuilder<Domain.Entities.NodeDefinition> builder)
    {
        builder.HasKey(x => x.Id);

        builder
            .HasIndex(x => new
            {
                x.Executor,
                x.Name,
                x.ProjectId,
            })
            .IsUnique()
            .HasFilter("\"IsDeleted\" = false");

        var jsonOptions = new JsonSerializerOptions
        {
            Converters = { new JsonStringEnumConverter() }
        };

        builder.Property(x => x.Inputs)
            .HasColumnType("jsonb")
            .HasConversion(
                v => JsonSerializer.Serialize(v, jsonOptions),
                v => JsonSerializer.Deserialize<List<PinDefinition>>(v, jsonOptions) ?? new List<PinDefinition>()
            )
            .Metadata.SetValueComparer(new ValueComparer<List<PinDefinition>>(
                (c1, c2) => JsonSerializer.Serialize(c1, jsonOptions) == JsonSerializer.Serialize(c2, jsonOptions),
                c => c == null ? 0 : JsonSerializer.Serialize(c, jsonOptions).GetHashCode(),
                c => JsonSerializer.Deserialize<List<PinDefinition>>(JsonSerializer.Serialize(c, jsonOptions), jsonOptions)!
            ));

        builder.Property(x => x.Outputs)
            .HasColumnType("jsonb")
            .HasConversion(
                v => JsonSerializer.Serialize(v, jsonOptions),
                v => JsonSerializer.Deserialize<List<PinDefinition>>(v, jsonOptions) ?? new List<PinDefinition>()
            )
            .Metadata.SetValueComparer(new ValueComparer<List<PinDefinition>>(
                (c1, c2) => JsonSerializer.Serialize(c1, jsonOptions) == JsonSerializer.Serialize(c2, jsonOptions),
                c => c == null ? 0 : JsonSerializer.Serialize(c, jsonOptions).GetHashCode(),
                c => JsonSerializer.Deserialize<List<PinDefinition>>(JsonSerializer.Serialize(c, jsonOptions), jsonOptions)!
            ));

        builder.Property(x => x.Dependencies)
            .HasColumnType("jsonb")
            .HasConversion(
                v => JsonSerializer.Serialize(v, jsonOptions),
                v => JsonSerializer.Deserialize<List<ScriptDependencyDto>>(v, jsonOptions) ?? new List<ScriptDependencyDto>()
            )
            .Metadata.SetValueComparer(new ValueComparer<List<ScriptDependencyDto>>(
                (c1, c2) => JsonSerializer.Serialize(c1, jsonOptions) == JsonSerializer.Serialize(c2, jsonOptions),
                c => c == null ? 0 : JsonSerializer.Serialize(c, jsonOptions).GetHashCode(),
                c => JsonSerializer.Deserialize<List<ScriptDependencyDto>>(JsonSerializer.Serialize(c, jsonOptions), jsonOptions)!
            ));
    }
}
