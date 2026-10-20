using Automation.Identity.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Automation.Identity.Infrastructure.Persistence.Configurations;

public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.HasKey(x => x.Id);
        
        builder.Property(x => x.Id)
            .ValueGeneratedNever();

        builder.Property(x => x.Email)
            .IsRequired()
            .HasMaxLength(256);
            
        builder.HasIndex(x => x.Email)
            .IsUnique()
            .HasFilter("\"DeletedAt\" IS NULL");

        builder.HasIndex(x => x.NormalizedEmail)
            .HasDatabaseName("EmailIndex")
            .HasFilter("\"DeletedAt\" IS NULL");

        builder.HasIndex(x => x.NormalizedUserName)
            .IsUnique()
            .HasDatabaseName("UserNameIndex")
            .HasFilter("\"DeletedAt\" IS NULL");

        builder.Property(x => x.DisplayName)
            .IsRequired()
            .HasMaxLength(256);
    }
}



