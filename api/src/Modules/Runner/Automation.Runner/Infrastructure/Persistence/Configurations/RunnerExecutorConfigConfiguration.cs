using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Automation.Runner.Domain.Entities;

namespace Automation.Runner.Infrastructure.Persistence.Configurations;

public class RunnerExecutorConfigConfiguration : IEntityTypeConfiguration<RunnerExecutorConfig>
{
    public void Configure(EntityTypeBuilder<RunnerExecutorConfig> builder)
    {
        builder.HasKey(x => x.Id);

        builder.Property(x => x.ExecutorKey)
            .IsRequired()
            .HasMaxLength(50);

        builder.Property(x => x.ExecutablePath)
            .IsRequired()
            .HasMaxLength(500);

        builder.Property(x => x.Version)
            .HasMaxLength(50);

        builder.HasIndex(x => new { x.RunnerId, x.ExecutorKey })
            .IsUnique();
    }
}
