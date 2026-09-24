using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Automation.Repository.Infrastructure.Persistence.Configurations;

public class RepositoryRunnerConfiguration : IEntityTypeConfiguration<Domain.Entities.RepositoryRunner>
{
    public void Configure(EntityTypeBuilder<Domain.Entities.RepositoryRunner> builder)
    {
        builder.ToTable("RepositoryRunners");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.RootPath)
            .IsRequired()
            .HasMaxLength(500);

        builder.HasOne(x => x.Repository)
            .WithMany(x => x.RepositoryRunners)
            .HasForeignKey(x => x.RepositoryId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(x => new { x.RepositoryId, x.RunnerId })
            .IsUnique();
    }
}
