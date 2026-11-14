using System.Text.Json;
using System.Text.Json.Serialization;
using Automation.Pipeline.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Automation.Pipeline.Infrastructure.Persistence.Configurations;

public class PipelineConfiguration : IEntityTypeConfiguration<Domain.Entities.Pipeline>
{
    public void Configure(EntityTypeBuilder<Domain.Entities.Pipeline> builder)
    {
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Name).IsRequired().HasMaxLength(255);

        builder.Property(x => x.TriggerType)
            .HasConversion<string>()
            .HasMaxLength(50)
            .IsRequired();

        builder.Property(x => x.TriggerConfig)
            .HasColumnType("jsonb")
            .IsRequired(false);

        builder.Property(x => x.GraphHash)
            .HasMaxLength(64)
            .IsRequired(false);

        builder.Property(x => x.ActiveSnapshotId)
            .IsRequired(false);

        builder.HasOne(x => x.ActiveSnapshot)
            .WithMany()
            .HasForeignKey(x => x.ActiveSnapshotId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(x => new { x.ProjectId, x.Name })
            .IsUnique()
            .HasFilter("\"DeletedAt\" IS NULL");

        var jsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            Converters = { new JsonStringEnumConverter() }
        };

        builder.Property(x => x.GraphData)
            .HasColumnType("jsonb")
            .HasConversion(
                v => JsonSerializer.Serialize(v ?? new PipelineGraphDocument(), jsonOptions),
                v => SafeDeserializeGraphData(v, jsonOptions)
            )
            .Metadata.SetValueComparer(new ValueComparer<PipelineGraphDocument>(
                (c1, c2) => JsonSerializer.Serialize(c1, jsonOptions) == JsonSerializer.Serialize(c2, jsonOptions),
                c => c == null ? 0 : JsonSerializer.Serialize(c, jsonOptions).GetHashCode(),
                c => SafeDeserializeGraphData(JsonSerializer.Serialize(c, jsonOptions), jsonOptions)
            ));
    }

    private static PipelineGraphDocument SafeDeserializeGraphData(string? json, JsonSerializerOptions options)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return new PipelineGraphDocument();
        }

        try
        {
            return JsonSerializer.Deserialize<PipelineGraphDocument>(json, options) ?? new PipelineGraphDocument();
        }
        catch
        {
            return new PipelineGraphDocument();
        }
    }
}
