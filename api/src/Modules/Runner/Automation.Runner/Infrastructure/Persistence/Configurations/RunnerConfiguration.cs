using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Automation.Runner.Infrastructure.Persistence.Configurations;

public class RunnerConfiguration : IEntityTypeConfiguration<Domain.Entities.Runner>
{
    public void Configure(EntityTypeBuilder<Domain.Entities.Runner> builder)
    {
        builder.HasKey(x => x.Id);

        builder.Property(x => x.Name)
            .IsRequired()
            .HasMaxLength(150);

        builder.Property(x => x.MachineKey)
            .IsRequired()
            .HasMaxLength(255);

        builder.Property(x => x.RegistrationToken)
            .IsRequired()
            .HasMaxLength(255);

        builder.HasIndex(x => x.MachineKey)
            .IsUnique();

        builder.HasIndex(x => x.RegistrationToken)
            .IsUnique();

        builder.HasMany(x => x.ExecutorConfigs)
            .WithOne(x => x.Runner)
            .HasForeignKey(x => x.RunnerId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
