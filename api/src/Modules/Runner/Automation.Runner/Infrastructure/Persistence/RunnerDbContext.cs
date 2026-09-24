using Automation.SharedKernel.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Automation.Runner.Domain.Entities;

namespace Automation.Runner.Infrastructure.Persistence;

public class RunnerDbContext : DbContext
{
    public RunnerDbContext(DbContextOptions<RunnerDbContext> options) : base(options)
    {
    }

    public DbSet<Domain.Entities.Runner> Runners => Set<Domain.Entities.Runner>();
    public DbSet<RunnerExecutorConfig> RunnerExecutorConfigs => Set<RunnerExecutorConfig>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("runner");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(RunnerDbContext).Assembly);
        modelBuilder.ApplySharedKernelConfigurations();
        base.OnModelCreating(modelBuilder);
    }
}
