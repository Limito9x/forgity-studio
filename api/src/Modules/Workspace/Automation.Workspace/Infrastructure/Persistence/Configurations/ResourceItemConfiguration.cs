using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Automation.Workspace.Infrastructure.Persistence.Configurations;

public class ResourceItemConfiguration : IEntityTypeConfiguration<Domain.Entities.ResourceItem>
{
    public void Configure(EntityTypeBuilder<Domain.Entities.ResourceItem> builder)
    {
        builder.HasKey(x => x.Id);

        builder.Property(x => x.DisplayName).IsRequired().HasMaxLength(255);

        builder.Property(x => x.RelativePath).HasMaxLength(500);

        builder
            .HasOne(x => x.Repository)
            .WithMany(x => x.Resources)
            .HasForeignKey(x => x.RepositoryId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(x => x.PlatformExtensionId);
        builder.HasIndex(x => x.ContentId);
        builder.HasIndex(x => new { x.RepositoryId, x.RelativePath }).IsUnique();
        builder.HasIndex(x => new { x.RepositoryId, x.DisplayName });
    }
}
