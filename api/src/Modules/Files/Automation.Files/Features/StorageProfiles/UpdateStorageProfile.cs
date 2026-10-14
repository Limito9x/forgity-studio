using FastEndpoints;
using FluentResults;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.Attributes;
using Automation.Files.Domain.Enums;
using Automation.Files.Infrastructure.Persistence;
using Automation.Files.Infrastructure.Storage;
using Automation.SharedKernel.Extensions.Results;

namespace Automation.Files.Features.StorageProfiles;

public record UpdateStorageProfileCommand(
    Guid Id,
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

public class UpdateStorageProfileValidator : AbstractValidator<UpdateStorageProfileCommand>
{
    public UpdateStorageProfileValidator()
    {
        RuleFor(x => x.Id).NotEmpty().WithMessage("Id is required.");
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200).WithMessage("Name is required and must not exceed 200 characters.");
        RuleFor(x => x.BucketName).NotEmpty().MaximumLength(200).WithMessage("BucketName is required and must not exceed 200 characters.");
        RuleFor(x => x.ServiceUrl).NotEmpty().MaximumLength(500).WithMessage("ServiceUrl is required and must not exceed 500 characters.");
    }
}

public class UpdateStorageProfileEndpoint(IMessageBus bus) : Endpoint<UpdateStorageProfileCommand, StorageProfileDto>
{
    public override void Configure()
    {
        Put("{id}");
        Group<StorageProfilesGroup>();
        AllowAnonymous();
    }

    public override async Task HandleAsync(UpdateStorageProfileCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<StorageProfileDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(FilesDbContext))]
public class UpdateStorageProfileHandler(
    FilesDbContext dbContext,
    IStorageServiceFactory storageFactory
)
{
    public async Task<Result<StorageProfileDto>> HandleAsync(UpdateStorageProfileCommand command, CancellationToken ct)
    {
        var profile = await dbContext.StorageProfiles.FirstOrDefaultAsync(x => x.Id == command.Id, ct);
        if (profile == null)
            return Result.Fail<StorageProfileDto>($"Storage profile '{command.Id}' was not found.");

        if (command.IsDefault && !profile.IsDefault)
        {
            var otherDefaults = await dbContext.StorageProfiles
                .Where(x => x.StudioId == profile.StudioId && x.Id != profile.Id && x.IsDefault)
                .ToListAsync(ct);

            foreach (var other in otherDefaults)
            {
                other.SetDefault(false);
            }
        }

        var quotaBytes = command.StorageQuotaBytes;
        if (command.ProviderType == StorageProviderType.StudioCloud && !quotaBytes.HasValue)
        {
            quotaBytes = 200L * 1024 * 1024;
        }

        var secretKey = string.IsNullOrWhiteSpace(command.SecretKey) ? profile.SecretKey : command.SecretKey;
        var accessKey = string.IsNullOrWhiteSpace(command.AccessKey) ? profile.AccessKey : command.AccessKey;

        profile.Update(
            command.Name,
            command.ProviderType,
            command.BucketName,
            command.ServiceUrl,
            command.Region,
            accessKey,
            secretKey,
            command.PublicBaseUrl,
            quotaBytes,
            command.IsDefault
        );

        await dbContext.SaveChangesAsync(ct);
        storageFactory.InvalidateCache(profile.Id);

        var usedBytes = await dbContext.Assets
            .AsNoTracking()
            .Where(x => x.StorageProfileId == profile.Id || (profile.ProviderType == StorageProviderType.StudioCloud && profile.IsDefault && x.StorageProfileId == null))
            .SumAsync(x => (long?)x.SizeBytes, ct) ?? 0L;

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
            usedBytes,
            profile.StorageQuotaBytes,
            profile.IsDefault,
            profile.CreatedAt,
            profile.UpdatedAt
        ));
    }
}
