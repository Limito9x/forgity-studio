using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Automation.Pipeline.Infrastructure.Persistence.Configurations;

public class PipelineNodeConfiguration : IEntityTypeConfiguration<Domain.Entities.PipelineNode>
{
    public void Configure(EntityTypeBuilder<Domain.Entities.PipelineNode> builder)
    {
        builder.HasKey(x => x.Id);

        builder
            .HasOne(x => x.Pipeline)
            .WithMany(x => x.Nodes)
            .HasForeignKey(x => x.PipelineId)
            .OnDelete(DeleteBehavior.Cascade);

        builder
            .HasOne(x => x.Parent)
            .WithMany(x => x.Children)
            .HasForeignKey(x => x.ParentId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.SetNull);

        builder.ComplexProperty(x => x.Position);

        builder.ComplexProperty(x => x.Size, cb =>
        {
            cb.IsRequired(false);
        });

        builder.Property(x => x.Kind)
            .HasConversion<string>()
            .HasMaxLength(30)
            .IsRequired();

        builder.Property(x => x.Config)
            .HasColumnType("jsonb");

        builder.Property(x => x.Metadata)
            .HasColumnType("jsonb");
    }
}

