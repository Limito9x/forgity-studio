using Automation.Studio.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Automation.Studio.Infrastructure.Persistence.Configurations;

public class ProjectMigrationLogConfiguration : IEntityTypeConfiguration<ProjectMigrationLog>
{
    public void Configure(EntityTypeBuilder<ProjectMigrationLog> builder)
    {
        builder.ToTable("ProjectMigrationLogs");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.UserDisplayName).IsRequired().HasMaxLength(255);

        builder.Property(x => x.PackageFileName).IsRequired().HasMaxLength(255);

        builder.Property(x => x.PackageChecksumSha256).HasMaxLength(64);

        builder.Property(x => x.SelectedDomains).HasColumnType("jsonb");

        builder.Property(x => x.DomainSummaries).HasColumnType("jsonb");

        builder.HasIndex(x => new { x.ProjectId, x.CreatedAt });
        builder.HasIndex(x => x.StudioId);

        builder
            .HasOne(x => x.Project)
            .WithMany()
            .HasForeignKey(x => x.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);

        builder
            .HasOne(x => x.Studio)
            .WithMany()
            .HasForeignKey(x => x.StudioId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
