using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Automation.Pipeline.Infrastructure.Persistence.Configurations;

public class PipelineEdgeConfiguration : IEntityTypeConfiguration<Domain.Entities.PipelineEdge>
{
    public void Configure(EntityTypeBuilder<Domain.Entities.PipelineEdge> builder)
    {
        builder.HasKey(x => x.Id);
        
        builder.HasOne(x => x.Pipeline)
            .WithMany()
            .HasForeignKey(x => x.PipelineId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(x => x.SourcePipelineNode)
            .WithMany()
            .HasForeignKey(x => x.SourcePipelineNodeId)
            .OnDelete(DeleteBehavior.Cascade);
            
        builder.HasOne(x => x.TargetPipelineNode)
            .WithMany()
            .HasForeignKey(x => x.TargetPipelineNodeId)
            .OnDelete(DeleteBehavior.Cascade);
            
        builder.Property(x => x.SourcePin)
            .IsRequired()
            .HasMaxLength(100);
            
        builder.Property(x => x.TargetPin)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(x => x.Kind)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
    }
}
