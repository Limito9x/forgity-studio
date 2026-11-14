using Automation.Files.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Automation.Files.Infrastructure.Persistence.Configurations;

public class StorageProfileConfiguration : IEntityTypeConfiguration<StorageProfile>
{
    public void Configure(EntityTypeBuilder<StorageProfile> builder)
    {
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Name).IsRequired().HasMaxLength(200);
        builder.Property(x => x.BucketName).IsRequired().HasMaxLength(200);
        builder.Property(x => x.ServiceUrl).IsRequired().HasMaxLength(500);
        builder.Property(x => x.Region).HasMaxLength(100);
        builder.Property(x => x.AccessKey).HasMaxLength(500);
        builder.Property(x => x.SecretKey).HasMaxLength(1000);
        builder.Property(x => x.PublicBaseUrl).HasMaxLength(500);

        builder.HasIndex(x => x.StudioId);
        builder.HasIndex(x => new { x.StudioId, x.IsDefault });
    }
}
