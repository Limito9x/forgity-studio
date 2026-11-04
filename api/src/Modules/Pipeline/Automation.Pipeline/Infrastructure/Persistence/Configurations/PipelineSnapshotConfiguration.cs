using System.Text.Json;
using System.Text.Json.Serialization;
using Automation.Pipeline.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Automation.Pipeline.Infrastructure.Persistence.Configurations;

public class PipelineSnapshotConfiguration : IEntityTypeConfiguration<PipelineSnapshot>
{
    public void Configure(EntityTypeBuilder<PipelineSnapshot> builder)
    {
        builder.ToTable("PipelineSnapshots");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.PipelineId)
            .IsRequired();

        builder.Property(x => x.VersionNumber)
            .IsRequired();

        builder.Property(x => x.GraphHash)
            .HasMaxLength(64)
            .IsRequired();

        builder.Property(x => x.Source)
            .HasMaxLength(50)
            .IsRequired();

        builder.Property(x => x.Summary)
            .HasMaxLength(500)
            .IsRequired(false);

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

        builder.HasOne(x => x.Pipeline)
            .WithMany()
            .HasForeignKey(x => x.PipelineId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(x => new { x.PipelineId, x.VersionNumber })
            .IsUnique();

        builder.HasIndex(x => new { x.PipelineId, x.CreatedAt });
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

