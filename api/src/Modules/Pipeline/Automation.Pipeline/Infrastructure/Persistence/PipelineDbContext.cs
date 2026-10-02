using Automation.Pipeline.Domain;
using Automation.SharedKernel.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Infrastructure.Persistence;

public class PipelineDbContext : DbContext
{
    public PipelineDbContext(DbContextOptions<PipelineDbContext> options)
        : base(options) { }

    public DbSet<Domain.Entities.NodeDefinition> NodeDefinitions =>
        Set<Domain.Entities.NodeDefinition>();
    public DbSet<Domain.Entities.Pipeline> Pipelines => Set<Domain.Entities.Pipeline>();
    public DbSet<Domain.Entities.PipelineNode> PipelineNodes => Set<Domain.Entities.PipelineNode>();
    public DbSet<Domain.Entities.PipelineEdge> PipelineEdges => Set<Domain.Entities.PipelineEdge>();
    public DbSet<Domain.Entities.PipelineExecution> PipelineExecutions =>
        Set<Domain.Entities.PipelineExecution>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("pipeline");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(PipelineDbContext).Assembly);
        modelBuilder.ApplySharedKernelConfigurations();
        base.OnModelCreating(modelBuilder);
    }
}
