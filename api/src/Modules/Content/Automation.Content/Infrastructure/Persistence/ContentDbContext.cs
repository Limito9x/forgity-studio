using Automation.SharedKernel.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Automation.Content.Domain;

namespace Automation.Content.Infrastructure.Persistence;

public class ContentDbContext : DbContext
{
    public ContentDbContext(DbContextOptions<ContentDbContext> options) : base(options)
    {
    }

    public DbSet<Domain.Entities.ContentType> ContentTypes => Set<Domain.Entities.ContentType>();
    public DbSet<Domain.Entities.ContentItem> ContentItems => Set<Domain.Entities.ContentItem>();
    public DbSet<Domain.Entities.ContentAnchorLink> ContentAnchorLinks => Set<Domain.Entities.ContentAnchorLink>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("content");
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ContentDbContext).Assembly);
        modelBuilder.ApplySharedKernelConfigurations();
        base.OnModelCreating(modelBuilder);
    }
}
