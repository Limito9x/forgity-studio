using Automation.SharedKernel.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Automation.Workspace.Domain.Entities;

namespace Automation.Workspace.Infrastructure.Persistence;

public class WorkspaceDbContext : DbContext
{
    public WorkspaceDbContext(DbContextOptions<WorkspaceDbContext> options) : base(options)
    {
    }

    public DbSet<Repository> Repositories => Set<Repository>();
    public DbSet<RepositoryRunner> RepositoryRunners => Set<RepositoryRunner>();
    public DbSet<ResourceItem> ResourceItems => Set<ResourceItem>();
    public DbSet<ResourceVersion> ResourceVersions => Set<ResourceVersion>();
    public DbSet<ResourceVersionLocation> ResourceVersionLocations => Set<ResourceVersionLocation>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("workspace");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(WorkspaceDbContext).Assembly);
        modelBuilder.ApplySharedKernelConfigurations();
        base.OnModelCreating(modelBuilder);
    }
}
