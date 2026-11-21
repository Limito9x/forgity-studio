using Automation.Studio.Contracts;
using Automation.Studio.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Automation.Studio.Infrastructure.Persistence.Configurations;

public class StudioConfiguration : IEntityTypeConfiguration<StudioEntity>
{
    public void Configure(EntityTypeBuilder<StudioEntity> builder)
    {
        builder.ToTable("Studios");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Name)
            .IsRequired()
            .HasMaxLength(255);

        builder.Property(x => x.Slug)
            .IsRequired()
            .HasMaxLength(100);

        builder.HasIndex(x => x.Slug)
            .IsUnique();

        builder.Property(x => x.PlanTier)
            .HasDefaultValue(StudioPlanTier.Community);

        builder.Property(x => x.StudioManagedStorageQuotaBytes)
            .HasDefaultValue(200L * 1024 * 1024);

        builder.Property(x => x.StudioManagedStorageUsedBytes)
            .HasDefaultValue(0L);

        builder.HasMany(x => x.Projects)
            .WithOne(x => x.Studio)
            .HasForeignKey(x => x.StudioId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
