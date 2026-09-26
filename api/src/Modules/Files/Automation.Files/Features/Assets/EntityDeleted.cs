using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Automation.Files.Infrastructure.Persistence;
using Automation.SharedKernel.Domain.Events;

namespace Automation.Files.Features.Assets;

public class EntityDeletedHandler(FilesDbContext db, ILogger<EntityDeletedHandler> logger)
{
    public async Task HandleAsync(EntityDeletedMessage message, CancellationToken ct)
    {
        var links = await db.AssetLinks
            .Where(x => x.OwnerEntityType == message.OwnerEntityType && x.OwnerEntityId == message.OwnerEntityId)
            .ToListAsync(ct);

        if (links.Count == 0) return;

        logger.LogInformation("Automatically removing {Count} asset link(s) for deleted entity {OwnerEntityType} (ID: {OwnerEntityId})",
            links.Count, message.OwnerEntityType, message.OwnerEntityId);

        db.AssetLinks.RemoveRange(links);
        await db.SaveChangesAsync(ct);
    }
}
