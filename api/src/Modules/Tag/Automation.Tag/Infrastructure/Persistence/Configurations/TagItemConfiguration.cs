using Automation.Tag.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Automation.Tag.Infrastructure.Persistence.Configurations;

public class TagItemConfiguration : IEntityTypeConfiguration<TagItem>
{
    public void Configure(EntityTypeBuilder<TagItem> builder)
    {
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Path)
            .IsRequired();

        builder.Property(x => x.Name)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(x => x.Color)
            .HasMaxLength(50);

        builder.Property(x => x.Description)
            .HasMaxLength(500);

        builder.HasOne(x => x.Parent)
            .WithMany(x => x.Children)
            .HasForeignKey(x => x.ParentId)
            .OnDelete(DeleteBehavior.Cascade);

        // Unique per project and path
        builder.HasIndex(x => new { x.ProjectId, x.Path })
            .IsUnique();

        // GiST index for hierarchical queries
        builder.HasIndex(x => x.Path)
            .HasMethod("gist");
    }
}