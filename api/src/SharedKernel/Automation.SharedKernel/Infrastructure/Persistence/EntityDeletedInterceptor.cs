using Automation.SharedKernel.Domain.Events;
using Automation.SharedKernel.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Wolverine;

namespace Automation.SharedKernel.Infrastructure.Persistence;

public sealed class EntityDeletedInterceptor(
    ILogger<EntityDeletedInterceptor> logger,
    IServiceScopeFactory scopeFactory
) : SaveChangesInterceptor
{
    private readonly ILogger<EntityDeletedInterceptor> _logger = logger;
    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;

    /// <summary>
    /// Factory method hỗ trợ khởi tạo nhanh trong các bài Unit Tests mà không cần dựng ServiceProvider đầy đủ.
    /// </summary>
    public static EntityDeletedInterceptor CreateForTest(
        IMessageBus bus,
        ILogger<EntityDeletedInterceptor>? logger = null
    )
    {
        return new EntityDeletedInterceptor(
            logger ?? NullLogger<EntityDeletedInterceptor>.Instance,
            new TestServiceScopeFactory(bus)
        );
    }

    private sealed class TestServiceScopeFactory(IMessageBus bus)
        : IServiceScopeFactory,
            IServiceScope,
            IServiceProvider,
            IAsyncDisposable
    {
        public IServiceScope CreateScope() => this;
        public IServiceProvider ServiceProvider => this;
        public object? GetService(Type serviceType) => serviceType == typeof(IMessageBus) ? bus : null;
        public void Dispose() { }
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default
    )
    {
        if (eventData.Context is null)
            return await base.SavingChangesAsync(eventData, result, cancellationToken);

        var context = eventData.Context;
        var deletedMessages = new List<EntityDeletedMessage>();

        foreach (var entry in context.ChangeTracker.Entries())
        {
            var isHardDeleted = entry.State == EntityState.Deleted;
            var isSoftDeleted =
                entry.Entity is ISoftDelete softDelete
                && (
                    entry.State == EntityState.Deleted
                    || (
                        entry.State == EntityState.Modified
                        && softDelete.DeletedAt != null
                        && entry.Property(nameof(ISoftDelete.DeletedAt)).IsModified
                    )
                );

            if (!isHardDeleted && !isSoftDeleted)
                continue;

            var idProperty = entry.Properties.FirstOrDefault(p => p.Metadata.IsPrimaryKey());
            var entityId =
                idProperty?.CurrentValue?.ToString() ?? idProperty?.OriginalValue?.ToString();

            if (string.IsNullOrEmpty(entityId))
                continue;

            var entityTypeName = entry.Metadata.ClrType.Name;
            deletedMessages.Add(new EntityDeletedMessage(entityTypeName, entityId));
        }

        if (deletedMessages.Count == 0)
            return await base.SavingChangesAsync(eventData, result, cancellationToken);

        await using var scope = _scopeFactory.CreateAsyncScope();
        var messageBus = scope.ServiceProvider.GetService<IMessageBus>();

        try
        {
            if (messageBus != null)
            {
                foreach (var message in deletedMessages.Distinct())
                {
                    _logger.LogInformation(
                        "Queueing EntityDeletedMessage for {OwnerEntityType} (ID: {OwnerEntityId})",
                        message.OwnerEntityType,
                        message.OwnerEntityId
                    );
                    await messageBus.PublishAsync(message);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error publishing EntityDeletedMessage");
        }

        return await base.SavingChangesAsync(eventData, result, cancellationToken);
    }
}
