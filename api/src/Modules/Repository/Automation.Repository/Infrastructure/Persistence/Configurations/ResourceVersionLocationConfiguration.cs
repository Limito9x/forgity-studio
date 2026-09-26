using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Automation.Repository.Infrastructure.Persistence.Configurations;

public class ResourceVersionLocationConfiguration
    : IEntityTypeConfiguration<Domain.Entities.ResourceVersionLocation>
{
    public void Configure(EntityTypeBuilder<Domain.Entities.ResourceVersionLocation> builder)
    {
        builder.HasKey(x => x.Id);

        builder
            .HasOne(x => x.ResourceVersion)
            .WithMany(x => x.Locations)
            .HasForeignKey(x => x.ResourceVersionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder
            .HasOne(x => x.RepositoryRunner)
            .WithMany(x => x.Locations)
            .HasForeignKey(x => x.RepositoryRunnerId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(x => new { x.ResourceVersionId, x.RepositoryRunnerId }).IsUnique();
    }
}
