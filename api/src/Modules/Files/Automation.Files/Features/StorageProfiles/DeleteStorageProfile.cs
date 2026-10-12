using FastEndpoints;
using FluentResults;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.Attributes;
using Automation.Files.Infrastructure.Persistence;
using Automation.Files.Infrastructure.Storage;
using Automation.SharedKernel.Extensions.Results;

namespace Automation.Files.Features.StorageProfiles;

public record DeleteStorageProfileCommand(Guid Id);

public class DeleteStorageProfileEndpoint(IMessageBus bus) : Endpoint<DeleteStorageProfileCommand, Result>
{
    public override void Configure()
    {
        Delete("{id}");
        Group<StorageProfilesGroup>();
        AllowAnonymous();
    }

    public override async Task HandleAsync(DeleteStorageProfileCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(FilesDbContext))]
public class DeleteStorageProfileHandler(
    FilesDbContext dbContext,
    IStorageServiceFactory storageFactory
)
{
    public async Task<Result> HandleAsync(DeleteStorageProfileCommand command, CancellationToken ct)
    {
        var profile = await dbContext.StorageProfiles.FirstOrDefaultAsync(x => x.Id == command.Id, ct);
        if (profile == null)
            return Result.Ok(); // Idempotent

        var hasAssets = await dbContext.Assets.AnyAsync(x => x.StorageProfileId == command.Id, ct);
        if (hasAssets)
        {
            return Result.Fail("Cannot delete this storage profile because assets are currently stored in it.");
        }

        dbContext.StorageProfiles.Remove(profile);
        await dbContext.SaveChangesAsync(ct);

        storageFactory.InvalidateCache(profile.Id);

        return Result.Ok();
    }
}
