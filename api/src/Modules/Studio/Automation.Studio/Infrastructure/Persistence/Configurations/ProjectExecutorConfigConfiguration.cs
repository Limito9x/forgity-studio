using Automation.Studio.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Automation.Studio.Infrastructure.Persistence.Configurations;

public class ProjectExecutorConfigConfiguration : IEntityTypeConfiguration<ProjectExecutorConfig>
{
    public void Configure(EntityTypeBuilder<ProjectExecutorConfig> builder)
    {
        builder.HasKey(x => x.Id);

        builder.HasOne(x => x.Project)
            .WithMany()
            .HasForeignKey(x => x.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Property(x => x.AgentId)
            .IsRequired();

        builder.Property(x => x.ExecutorKey)
            .IsRequired()
            .HasMaxLength(50);

        builder.Property(x => x.Settings)
            .HasColumnType("jsonb");

        builder.HasIndex(x => new { x.ProjectId, x.AgentId, x.ExecutorKey })
            .IsUnique();
    }
}
