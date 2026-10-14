using FastEndpoints;
using FluentResults;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.Attributes;
using Automation.Files.Domain.Entities;
using Automation.Files.Domain.Enums;
using Automation.Files.Infrastructure.Persistence;
using Automation.SharedKernel.Extensions.Results;

namespace Automation.Files.Features.StorageProfiles;

public record CreateStorageProfileCommand(
    Guid StudioId,
    string Name,
    StorageProviderType ProviderType,
    string BucketName,
    string ServiceUrl,
    string? Region = null,
    string? AccessKey = null,
    string? SecretKey = null,
    string? PublicBaseUrl = null,
    long? StorageQuotaBytes = null,
    bool IsDefault = false
);

public class CreateStorageProfileValidator : AbstractValidator<CreateStorageProfileCommand>
{
    public CreateStorageProfileValidator()
    {
        RuleFor(x => x.StudioId).NotEmpty().WithMessage("StudioId is required.");
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200).WithMessage("Name is required and must not exceed 200 characters.");
        RuleFor(x => x.BucketName).NotEmpty().MaximumLength(200).WithMessage("BucketName is required and must not exceed 200 characters.");
        RuleFor(x => x.ServiceUrl).NotEmpty().MaximumLength(500).WithMessage("ServiceUrl is required and must not exceed 500 characters.");

        When(x => x.ProviderType == StorageProviderType.CustomS3, () =>
        {
            RuleFor(x => x.AccessKey).NotEmpty().WithMessage("AccessKey is required for CustomS3.");
            RuleFor(x => x.SecretKey).NotEmpty().WithMessage("SecretKey is required for CustomS3.");
        });
    }
}

public class CreateStorageProfileEndpoint(IMessageBus bus) : Endpoint<CreateStorageProfileCommand, StorageProfileDto>
{
    public override void Configure()
    {
        Post("");
        Group<StorageProfilesGroup>();
    }

    public override async Task HandleAsync(CreateStorageProfileCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<StorageProfileDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(FilesDbContext))]
public class CreateStorageProfileHandler(FilesDbContext dbContext)
{
    public async Task<Result<StorageProfileDto>> HandleAsync(CreateStorageProfileCommand command, CancellationToken ct)
    {
        var hasExisting = await dbContext.StorageProfiles.AnyAsync(x => x.StudioId == command.StudioId, ct);
        var isDefault = command.IsDefault || !hasExisting;

        if (isDefault && hasExisting)
        {
            var defaultProfiles = await dbContext.StorageProfiles
                .Where(x => x.StudioId == command.StudioId && x.IsDefault)
                .ToListAsync(ct);

            foreach (var existing in defaultProfiles)
            {
                existing.SetDefault(false);
            }
        }

        var quotaBytes = command.StorageQuotaBytes;
        if (command.ProviderType == StorageProviderType.StudioCloud && !quotaBytes.HasValue)
        {
            quotaBytes = 200L * 1024 * 1024; // 200MB default
        }

        var profile = new StorageProfile(
            command.StudioId,
            command.Name,
            command.ProviderType,
            command.BucketName,
            command.ServiceUrl,
            command.Region,
            command.AccessKey,
            command.SecretKey,
            command.PublicBaseUrl,
            quotaBytes,
            isDefault
        );

        dbContext.StorageProfiles.Add(profile);
        await dbContext.SaveChangesAsync(ct);

        return Result.Ok(new StorageProfileDto(
            profile.Id,
            profile.StudioId,
            profile.Name,
            profile.ProviderType,
            profile.BucketName,
            profile.ServiceUrl,
            profile.Region,
            profile.AccessKey,
            !string.IsNullOrWhiteSpace(profile.SecretKey),
            profile.PublicBaseUrl,
            0L,
            profile.StorageQuotaBytes,
            profile.IsDefault,
            profile.CreatedAt,
            profile.UpdatedAt
        ));
    }
}
