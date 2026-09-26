using System.Text.Json;
using Automation.Runner.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
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

        builder.Property(x => x.OsPlatform)
            .HasMaxLength(100);

        builder.Property(x => x.CpuModel)
            .HasMaxLength(255);

        builder.Property(x => x.PrimaryGpuName)
            .HasMaxLength(255);

        var jsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        };

        builder.Property(x => x.HardwareDetails)
            .HasColumnType("jsonb")
            .HasConversion(
                v => v == null ? null : JsonSerializer.Serialize(v, jsonOptions),
                v => string.IsNullOrWhiteSpace(v) ? null : JsonSerializer.Deserialize<RunnerHardwareProfile>(v, jsonOptions)
            )
            .Metadata.SetValueComparer(new ValueComparer<RunnerHardwareProfile?>(
                (c1, c2) => JsonSerializer.Serialize(c1, jsonOptions) == JsonSerializer.Serialize(c2, jsonOptions),
                c => c == null ? 0 : JsonSerializer.Serialize(c, jsonOptions).GetHashCode(),
                c => c == null ? null : JsonSerializer.Deserialize<RunnerHardwareProfile>(JsonSerializer.Serialize(c, jsonOptions), jsonOptions)
            ));

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
