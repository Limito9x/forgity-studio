using Automation.Content.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Automation.Content.Infrastructure.Persistence.Configurations;

public class ContentAnchorLinkConfiguration : IEntityTypeConfiguration<ContentAnchorLink>
{
    public void Configure(EntityTypeBuilder<ContentAnchorLink> builder)
    {
        builder.HasKey(x => x.Id);

        builder.HasOne(x => x.ContentItem)
            .WithMany()
            .HasForeignKey(x => x.ContentItemId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Property(x => x.AnchorPath)
            .IsRequired()
            .HasMaxLength(500);

        builder.Property(x => x.MetadataJson)
            .HasColumnType("jsonb");

        // 1. By ContentItem and AnchorPath (to query tree of a content item)
        builder.HasIndex(x => new { x.ContentItemId, x.AnchorPath });
        
        // 2. By TargetType and TargetId (for O(1) reverse lookup: which content owns this resource)
        builder.HasIndex(x => new { x.TargetType, x.TargetId });

        // 3. By ProjectId
        builder.HasIndex(x => x.ProjectId);
    }
}

