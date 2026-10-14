using Automation.Files.Contracts;
using Automation.Repository.Constants;
using Automation.Repository.Contracts;
using Automation.Repository.Domain.Enums;
using Automation.Repository.Infrastructure.Persistence;
using Automation.Repository.Shared.Dtos;
using Automation.Runner.Contracts;
using Automation.Studio.Contracts;
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
public class PublishResourceVersionHandler(
    RepositoryDbContext db,
    IMessageBus bus,
    IAssetApi assetApi,
    IRunnerApi runnerApi,
    IProjectsApi projectsApi
)
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
                .ThenInclude(l => l.RepositoryRunner)
            .FirstOrDefaultAsync(v => v.Id == cmd.ResourceVersionId, ct);

        if (version is null)
        {
            return Result.Fail<ResourceVersionDto>($"ResourceVersion '{cmd.ResourceVersionId}' was not found.");
        }

        if (version.Status == ResourceVersionStatus.Published)
        {
            return Result.Fail<ResourceVersionDto>($"Version v{version.VersionNo} has already been published.");
        }

        // 1. Tìm vị trí tệp gốc (Origin Runner)
        var originLocation = version.Locations.FirstOrDefault(l => l.IsOrigin) ?? version.Locations.FirstOrDefault();
        if (originLocation == null || originLocation.RepositoryRunner == null)
        {
            return Result.Fail<ResourceVersionDto>("No physical runner location was found for this draft version.");
        }

        var runnerId = originLocation.RepositoryRunner.RunnerId;
        var rootPath = originLocation.RepositoryRunner.RootPath;
        var relativePath = version.Resource.RelativePath;
        var fullPath = Path.Combine(rootPath, relativePath.TrimStart('/', '\\'));
        var fileName = Path.GetFileName(relativePath);

        // 2. Tra cứu StorageProfileId của Project (nếu có cấu hình)
        var projectId = version.Resource.Repository?.ProjectId ?? Guid.Empty;
        Guid? storageProfileId = null;
        if (projectId != Guid.Empty)
        {
            storageProfileId = await projectsApi.GetProjectStorageProfileIdAsync(projectId, ct);
        }

        // 3. Request Upload Ticket từ Module Files
        var extension = version.Resource.Extension ?? Path.GetExtension(relativePath);
        var mimeType = "application/octet-stream";

        var uploadItems = new[]
        {
            new UploadRequestItemDto(
                HashSha256: version.FileHash,
                Extension: extension,
                SizeBytes: version.SizeBytes,
                ContentType: mimeType
            )
        };

        var uploadRequestResult = await assetApi.RequestUploadAsync(uploadItems, storageProfileId, ct);
        if (uploadRequestResult.IsFailed || uploadRequestResult.Value.Count == 0)
        {
            return Result.Fail<ResourceVersionDto>(
                uploadRequestResult.Errors.FirstOrDefault()?.Message ?? "Failed to request upload ticket from Files service."
            );
        }

        var uploadTicket = uploadRequestResult.Value[0];

        // 4. Xử lý Upload hoặc Deduplication
        if (uploadTicket.IsAlreadyExists)
        {
            // Case A: CAS Deduplication Tức Thì (File cùng hash đã có trên Cloud)
            var linkResult = await assetApi.CreateLinkAsync(
                new AssetLinkRequestItem(uploadTicket.AssetId, fileName),
                new AssetLinkOwner("ResourceVersion", version.Id.ToString(), ResourceAssetSlots.ResourceVersion),
                sortOrder: 0,
                ct
            );

            if (linkResult.IsFailed)
            {
                return Result.Fail<ResourceVersionDto>(linkResult.Errors);
            }

            version.SetCloudSynced(linkResult.Value.AssetLinkId);
        }
        else
        {
            // Case B: Runner Streaming Upload vật lý lên Presigned URL
            if (string.IsNullOrWhiteSpace(uploadTicket.PresignedUrl))
            {
                return Result.Fail<ResourceVersionDto>("Missing presigned upload URL from storage service.");
            }

            var uploadCmdResult = await runnerApi.SendUploadCommandAsync(
                runnerId,
                fullPath,
                uploadTicket.PresignedUrl,
                mimeType,
                uploadTicket.AssetId,
                version.Id,
                ct
            );

            if (uploadCmdResult.IsFailed)
            {
                return Result.Fail<ResourceVersionDto>(
                    $"Runner streaming upload failed: {uploadCmdResult.Errors.FirstOrDefault()?.Message}"
                );
            }

            // Confirm upload lên Module Files
            var confirmResult = await assetApi.ConfirmUploadAsync([uploadTicket.AssetId], ct);
            if (confirmResult.IsFailed)
            {
                return Result.Fail<ResourceVersionDto>(
                    $"Confirming uploaded asset failed: {confirmResult.Errors.FirstOrDefault()?.Message}"
                );
            }

            // Liên kết AssetLink
            var linkResult = await assetApi.CreateLinkAsync(
                new AssetLinkRequestItem(uploadTicket.AssetId, fileName),
                new AssetLinkOwner("ResourceVersion", version.Id.ToString(), ResourceAssetSlots.ResourceVersion),
                sortOrder: 0,
                ct
            );

            if (linkResult.IsFailed)
            {
                return Result.Fail<ResourceVersionDto>(linkResult.Errors);
            }

            version.SetCloudSynced(linkResult.Value.AssetLinkId);
        }


        // 5. Khóa đóng băng phiên bản và gỡ bỏ Smart Collaborative Lock
        version.MarkAsPublished(cmd.Notes);
        version.Resource.Unlock();

        await db.SaveChangesAsync(ct);

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
