using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Automation.Pipeline.Infrastructure.Persistence.Configurations;

public class PipelineExecutionConfiguration : IEntityTypeConfiguration<Domain.Entities.PipelineExecution>
{
    public void Configure(EntityTypeBuilder<Domain.Entities.PipelineExecution> builder)
    {
        builder.HasKey(x => x.Id);
        
        builder.HasOne(x => x.Pipeline)
            .WithMany()
            .HasForeignKey(x => x.PipelineId)
            .OnDelete(DeleteBehavior.Cascade);
            
        builder.Property(x => x.Status)
            .HasConversion<string>()
            .HasMaxLength(50);

        builder.Property(x => x.AgentId)
            .IsRequired();

        builder.Property(x => x.ExecutionState)
            .HasColumnType("jsonb");

        builder.Property(x => x.CurrentBatchId)
            .HasMaxLength(100);

        builder.Property(x => x.ErrorMessage)
            .HasMaxLength(2000);

        builder.HasOne(x => x.ParentExecution)
            .WithMany()
            .HasForeignKey(x => x.ParentExecutionId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.SetNull);

        builder.Property(x => x.TriggeredByNodeId)
            .IsRequired(false);
    }
}


