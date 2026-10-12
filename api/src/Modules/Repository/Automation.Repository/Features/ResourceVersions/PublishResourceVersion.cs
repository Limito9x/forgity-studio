using Automation.Repository.Constants;
using Automation.Repository.Contracts;
using Automation.Repository.Domain.Enums;
using Automation.Repository.Infrastructure.Persistence;
using Automation.Repository.Shared.Dtos;
using FastEndpoints;
using FluentResults;
using FluentValidation;
using Mapster;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.Attributes;

namespace Automation.Repository.Features.ResourceVersions;

// 1. Command & Validator
public record PublishResourceVersionCommand(
    Guid ResourceVersionId,
    string? Notes = null
);

public class PublishResourceVersionValidator : AbstractValidator<PublishResourceVersionCommand>
{
    public PublishResourceVersionValidator()
    {
        RuleFor(x => x.ResourceVersionId).NotEmpty();
    }
}

// 2. Endpoint
public class PublishResourceVersionEndpoint(IMessageBus bus)
    : Endpoint<PublishResourceVersionCommand, ResourceVersionDto>
{
    public override void Configure()
    {
        Post("{id:guid}/publish");
        Group<ResourceVersionsGroup>();
        Permissions(P.Resource.Update);
        Description(x => x.WithName("PublishResourceVersion"));
    }

    public override async Task HandleAsync(PublishResourceVersionCommand req, CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var cmd = req with { ResourceVersionId = id };
        var result = await bus.InvokeAsync<Result<ResourceVersionDto>>(cmd, ct);
        await this.SendResultAsync(result, ct);
    }
}

// 3. Handler
[Transactional(typeof(RepositoryDbContext))]
public class PublishResourceVersionHandler(RepositoryDbContext db, IMessageBus bus)
{
    public async Task<Result<ResourceVersionDto>> HandleAsync(
        PublishResourceVersionCommand cmd,
        CancellationToken ct
    )
    {
        var version = await db.ResourceVersions
            .Include(v => v.Resource)
                .ThenInclude(r => r.Repository)
            .Include(v => v.Locations)
            .FirstOrDefaultAsync(v => v.Id == cmd.ResourceVersionId, ct);

        if (version is null)
        {
            return Result.Fail<ResourceVersionDto>($"ResourceVersion '{cmd.ResourceVersionId}' was not found.");
        }

        if (version.Status == ResourceVersionStatus.Published)
        {
            return Result.Fail<ResourceVersionDto>($"Version v{version.VersionNo} has already been published.");
        }

        version.MarkAsPublished(cmd.Notes);
        version.Resource.Unlock();

        await db.SaveChangesAsync(ct);

        var projectId = version.Resource.Repository?.ProjectId ?? Guid.Empty;
        var repositoryId = version.Resource.RepositoryId;

        await bus.PublishAsync(
            new ResourceVersionPublishedEvent(
                projectId,
                repositoryId,
                version.ResourceId,
                version.Id,
                version.VersionNo,
                version.Notes
            )
        );

        var dto = version.Adapt<ResourceVersionDto>();
        return Result.Ok(dto);
    }
}
