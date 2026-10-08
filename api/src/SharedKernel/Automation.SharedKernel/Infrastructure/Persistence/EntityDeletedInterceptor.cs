using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Automation.SharedKernel.Domain.Events;
using Automation.SharedKernel.Domain.Interfaces;
using Wolverine;
using Microsoft.Extensions.Logging;

namespace Automation.SharedKernel.Infrastructure.Persistence;

public sealed class EntityDeletedInterceptor(
    ILogger<EntityDeletedInterceptor> logger,
    IMessageBus messageBus) : SaveChangesInterceptor
{
    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        if (eventData.Context is null) return await base.SavingChangesAsync(eventData, result, cancellationToken);

        var context = eventData.Context;
        var deletedMessages = new List<EntityDeletedMessage>();

        foreach (var entry in context.ChangeTracker.Entries())
        {
            var isHardDeleted = entry.State == EntityState.Deleted;
            var isSoftDeleted = entry.Entity is ISoftDelete softDelete &&
                                (entry.State == EntityState.Deleted || 
                                (entry.State == EntityState.Modified && softDelete.DeletedAt != null &&
                                 entry.Property(nameof(ISoftDelete.DeletedAt)).OriginalValue == null));

            if (!isHardDeleted && !isSoftDeleted)
                continue;

            var idProperty = entry.Properties.FirstOrDefault(p => p.Metadata.IsPrimaryKey());
            var entityId = idProperty?.CurrentValue?.ToString()
                        ?? idProperty?.OriginalValue?.ToString();

            if (string.IsNullOrEmpty(entityId))
                continue;

            var entityTypeName = entry.Metadata.ClrType.Name;
            deletedMessages.Add(new EntityDeletedMessage(entityTypeName, entityId));
        }

        if (deletedMessages.Count == 0)
            return await base.SavingChangesAsync(eventData, result, cancellationToken);

        // Use the owning handler's scoped bus, enrolled in its transactional outbox.
        // A new DI scope would publish independently of the entity deletion transaction.
        foreach (var message in deletedMessages.Distinct())
        {
            logger.LogInformation("Queueing EntityDeletedMessage for {OwnerEntityType} (ID: {OwnerEntityId})",
                message.OwnerEntityType, message.OwnerEntityId);
            await messageBus.PublishAsync(message);
        }

        return await base.SavingChangesAsync(eventData, result, cancellationToken);
    }
}

