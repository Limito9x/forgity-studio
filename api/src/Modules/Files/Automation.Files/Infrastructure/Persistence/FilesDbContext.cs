using Automation.Files.Domain.Entities;
using Automation.SharedKernel.Abstractions.Security;
using Automation.SharedKernel.Infrastructure.Persistence;
using Automation.SharedKernel.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;

namespace Automation.Files.Infrastructure.Persistence;

public class FilesDbContext(
    DbContextOptions<FilesDbContext> options,
    ISecretProtector? secretProtector = null
) : DbContext(options)
{
    public const string Schema = "files";

    public DbSet<Asset> Assets => Set<Asset>();
    public DbSet<AssetLink> AssetLinks => Set<AssetLink>();
    public DbSet<StorageProfile> StorageProfiles => Set<StorageProfile>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(FilesDbContext).Assembly);
        
        modelBuilder.ApplySharedKernelConfigurations();

        if (secretProtector != null)
        {
            modelBuilder.Entity<StorageProfile>()
                .Property(x => x.SecretKey)
                .HasMaxLength(1000)
                .HasConversion((Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter)new EncryptedSecretConverter(secretProtector));
        }

        base.OnModelCreating(modelBuilder);
    }
}
