using Automation.Pipeline.Domain;
using Automation.SharedKernel.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Infrastructure.Persistence;

public class PipelineDbContext : DbContext
{
    public PipelineDbContext(DbContextOptions<PipelineDbContext> options)
        : base(options) { }

    // Unified Cloud Pipeline + Views + Library + ConstantProfile
    public DbSet<CloudPipeline> Pipelines => Set<CloudPipeline>();
    public DbSet<PipelineVersion> PipelineVersions => Set<PipelineVersion>();
    public DbSet<PipelineScriptArtifact> PipelineScriptArtifacts => Set<PipelineScriptArtifact>();
    public DbSet<ProjectPipelineView> ProjectPipelineViews => Set<ProjectPipelineView>();
    public DbSet<TemplatePackage> TemplatePackages => Set<TemplatePackage>();
    public DbSet<TemplateLibraryItem> TemplateLibraryItems => Set<TemplateLibraryItem>();
    public DbSet<ConstantProfile> ConstantProfiles => Set<ConstantProfile>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("pipeline");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(PipelineDbContext).Assembly);
        modelBuilder.ApplySharedKernelConfigurations();

        modelBuilder.Entity<CloudPipeline>().ToTable("Pipelines");

        modelBuilder
            .Entity<TemplatePackage>()
            .HasOne(x => x.PrimaryMasterVersion)
            .WithMany()
            .HasForeignKey(x => x.PrimaryMasterVersionId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder
            .Entity<TemplateLibraryItem>()
            .HasIndex(x => new
            {
                x.OwnerUserId,
                x.TemplatePackageId,
                x.MachineKey,
                x.PeriodKey,
            })
            .IsUnique();

        modelBuilder
            .Entity<TemplateLibraryItem>()
            .HasOne(x => x.TemplatePackage)
            .WithMany()
            .HasForeignKey(x => x.TemplatePackageId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder
            .Entity<TemplateLibraryItem>()
            .HasOne(x => x.ConstantProfile)
            .WithMany()
            .HasForeignKey(x => x.ConstantProfileId)
            .OnDelete(DeleteBehavior.SetNull);

        base.OnModelCreating(modelBuilder);
    }
}
