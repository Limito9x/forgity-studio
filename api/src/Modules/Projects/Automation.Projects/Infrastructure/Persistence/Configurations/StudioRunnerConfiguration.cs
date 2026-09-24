using Automation.Projects.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Automation.Projects.Infrastructure.Persistence.Configurations;

public class StudioRunnerConfiguration : IEntityTypeConfiguration<StudioRunner>
{
    public void Configure(EntityTypeBuilder<StudioRunner> builder)
    {
        builder.ToTable("StudioRunners");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Alias)
            .HasMaxLength(255);

        builder.HasIndex(x => new { x.StudioId, x.RunnerId })
            .IsUnique();
    }
}
