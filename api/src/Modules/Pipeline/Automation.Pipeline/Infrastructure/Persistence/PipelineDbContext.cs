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
    public DbSet<PipelineScript> PipelineScripts => Set<PipelineScript>();
    public DbSet<PipelineVersionScript> PipelineVersionScripts => Set<PipelineVersionScript>();
    public DbSet<ProjectPipelineView> ProjectPipelineViews => Set<ProjectPipelineView>();
    public DbSet<TemplatePackage> TemplatePackages => Set<TemplatePackage>();
    public DbSet<TemplatePackageMember> TemplatePackageMembers => Set<TemplatePackageMember>();
    public DbSet<TemplateLibraryItem> TemplateLibraryItems => Set<TemplateLibraryItem>();
    public DbSet<ConstantProfile> ConstantProfiles => Set<ConstantProfile>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("pipeline");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(PipelineDbContext).Assembly);
        modelBuilder.ApplySharedKernelConfigurations();

        modelBuilder.Entity<CloudPipeline>().ToTable("Pipelines");

        modelBuilder
            .Entity<CloudPipeline>()
            .HasIndex(x => x.Slug)
            .IsUnique();

        modelBuilder
            .Entity<PipelineScript>()
            .HasIndex(x => new { x.Key, x.ScriptHash })
            .IsUnique();

        modelBuilder
            .Entity<PipelineVersionScript>()
            .HasKey(x => new { x.PipelineVersionId, x.PipelineScriptId });

        modelBuilder
            .Entity<PipelineVersionScript>()
            .HasOne(x => x.PipelineVersion)
            .WithMany(v => v.VersionScripts)
            .HasForeignKey(x => x.PipelineVersionId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder
            .Entity<PipelineVersionScript>()
            .HasOne(x => x.PipelineScript)
            .WithMany(s => s.VersionScripts)
            .HasForeignKey(x => x.PipelineScriptId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder
            .Entity<TemplatePackage>()
            .HasOne(x => x.PrimaryMasterVersion)
            .WithMany()
            .HasForeignKey(x => x.PrimaryMasterVersionId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder
            .Entity<TemplatePackageMember>()
            .HasKey(x => new { x.TemplatePackageId, x.PipelineVersionId });

        modelBuilder
            .Entity<TemplatePackageMember>()
            .HasOne(x => x.TemplatePackage)
            .WithMany(p => p.Members)
            .HasForeignKey(x => x.TemplatePackageId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder
            .Entity<TemplatePackageMember>()
            .HasOne(x => x.PipelineVersion)
            .WithMany()
            .HasForeignKey(x => x.PipelineVersionId)
            .OnDelete(DeleteBehavior.Restrict);

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
