using Automation.Runner.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Automation.Runner.Infrastructure.Persistence.Configurations;

public class RunnerStudioConfiguration : IEntityTypeConfiguration<RunnerStudio>
{
    public void Configure(EntityTypeBuilder<RunnerStudio> builder)
    {
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Alias)
            .HasMaxLength(150);

        builder.HasIndex(x => new { x.RunnerId, x.StudioId })
            .IsUnique();

        builder.HasOne(x => x.Runner)
            .WithMany(x => x.Studios)
            .HasForeignKey(x => x.RunnerId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
