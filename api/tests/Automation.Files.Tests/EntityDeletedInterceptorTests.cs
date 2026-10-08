using Automation.SharedKernel.Domain.Events;
using Automation.SharedKernel.Domain.Interfaces;
using Automation.SharedKernel.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Wolverine;
using Xunit;
using Automation.Files.Infrastructure.Persistence;
using Automation.SharedKernel.Extensions.Modules;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Automation.Files.Tests;

public class EntityDeletedInterceptorTests
{
    [Fact]
    public void ModuleRegistration_ResolvesScopedInterceptorAndDbContextOptions()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(Substitute.For<ICurrentUserProvider>());
        services.AddScoped<IMessageBus>(_ => Substitute.For<IMessageBus>());
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Default"] = "Host=localhost;Database=unused;Username=test;Password=test"
        }).Build();
        services.AddModuleDbContext<FilesDbContext>(config, "files");
        using var provider = services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true });
        using var scope = provider.CreateScope();
        Assert.NotNull(scope.ServiceProvider.GetRequiredService<FilesDbContext>().Model);
        Assert.Same(scope.ServiceProvider.GetRequiredService<EntityDeletedInterceptor>(),
            scope.ServiceProvider.GetRequiredService<EntityDeletedInterceptor>());
    }

    [Fact]
    public async Task SoftDeletion_EmitsOnlyOnTransitionAndLaterHardDelete()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var bus = Substitute.For<IMessageBus>();
        var messages = new List<EntityDeletedMessage>();
        bus.When(x => x.PublishAsync(Arg.Any<EntityDeletedMessage>(), Arg.Any<DeliveryOptions>()))
            .Do(call => messages.Add(call.Arg<EntityDeletedMessage>()));
        var interceptor = new EntityDeletedInterceptor(NullLogger<EntityDeletedInterceptor>.Instance, bus);
        await using var db = new OwnerDb(new DbContextOptionsBuilder<OwnerDb>().UseSqlite(connection)
            .AddInterceptors(interceptor).Options);
        await db.Database.EnsureCreatedAsync();
        var owner = new FileOwner { Id = 1, Name = "Before" };
        db.Owners.Add(owner);
        await db.SaveChangesAsync();
        Assert.Empty(messages);
        owner.DeletedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        Assert.Equal(new EntityDeletedMessage(nameof(FileOwner), "1"), Assert.Single(messages));
        owner.Name = "After";
        await db.SaveChangesAsync();
        Assert.Single(messages);
        db.Owners.Remove(owner);
        await db.SaveChangesAsync();
        Assert.Equal(2, messages.Count);
    }

    public class FileOwner : ISoftDelete
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public bool IsDeleted => DeletedAt != null;
        public DateTimeOffset? DeletedAt { get; set; }
        public string? DeletedBy { get; set; }
    }

    public class OwnerDb(DbContextOptions<OwnerDb> options) : DbContext(options)
    {
        public DbSet<FileOwner> Owners => Set<FileOwner>();
    }
}
