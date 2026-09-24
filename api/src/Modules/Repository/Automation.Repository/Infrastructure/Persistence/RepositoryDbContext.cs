using Automation.SharedKernel.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Automation.Repository.Domain.Entities;
using RepositoryEntity = Automation.Repository.Domain.Entities.Repository;

namespace Automation.Repository.Infrastructure.Persistence;

public class RepositoryDbContext : DbContext
{
    public RepositoryDbContext(DbContextOptions<RepositoryDbContext> options) : base(options)
    {
    }

    public DbSet<RepositoryEntity> Repositories => Set<RepositoryEntity>();
    public DbSet<RepositoryRunner> RepositoryRunners => Set<RepositoryRunner>();
    public DbSet<ResourceItem> ResourceItems => Set<ResourceItem>();
    public DbSet<ResourceVersion> ResourceVersions => Set<ResourceVersion>();
    public DbSet<ResourceVersionLocation> ResourceVersionLocations => Set<ResourceVersionLocation>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("repository");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(RepositoryDbContext).Assembly);
        modelBuilder.ApplySharedKernelConfigurations();
        base.OnModelCreating(modelBuilder);
    }
}
