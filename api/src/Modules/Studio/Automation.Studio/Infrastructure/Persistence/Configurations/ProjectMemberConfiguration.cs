using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Automation.Studio.Infrastructure.Persistence.Configurations;

public class ProjectMemberConfiguration : IEntityTypeConfiguration<Domain.Entities.ProjectMember>
{
    public void Configure(EntityTypeBuilder<Domain.Entities.ProjectMember> builder)
    {
        builder.HasKey(x => x.Id);
        
        builder.HasOne(x => x.Project)
            .WithMany()
            .HasForeignKey(x => x.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);
            
        builder.Property(x => x.ProjectRole)
            .HasConversion<string>()
            .HasMaxLength(50);
            
        builder.HasIndex(x => new { x.ProjectId, x.UserId }).IsUnique();
    }
}

