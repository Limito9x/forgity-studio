using Amazon.S3;
using Amazon.S3.Model;
using FastEndpoints;
using FluentResults;
using FluentValidation;
using Wolverine;
using Automation.Files.Domain.Enums;
using Automation.Files.Infrastructure.Storage;
using Automation.SharedKernel.Extensions.Results;

namespace Automation.Files.Features.StorageProfiles;

public record TestStorageConnectionCommand(
    StorageProviderType ProviderType,
    string BucketName,
    string ServiceUrl,
    string? Region = null,
    string? AccessKey = null,
    string? SecretKey = null
);

public class TestStorageConnectionValidator : AbstractValidator<TestStorageConnectionCommand>
{
    public TestStorageConnectionValidator()
    {
        RuleFor(x => x.BucketName).NotEmpty().WithMessage("BucketName is required.");
        RuleFor(x => x.ServiceUrl).NotEmpty().WithMessage("ServiceUrl is required.");

        When(x => x.ProviderType == StorageProviderType.CustomS3, () =>
        {
            RuleFor(x => x.AccessKey).NotEmpty().WithMessage("AccessKey is required for CustomS3.");
            RuleFor(x => x.SecretKey).NotEmpty().WithMessage("SecretKey is required for CustomS3.");
        });
    }
}

public class TestStorageConnectionEndpoint(IMessageBus bus) : Endpoint<TestStorageConnectionCommand, TestConnectionResultDto>
{
    public override void Configure()
    {
        Post("test-connection");
        Group<StorageProfilesGroup>();
        AllowAnonymous();
    }

    public override async Task HandleAsync(TestStorageConnectionCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<TestConnectionResultDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class TestStorageConnectionHandler()
{
    public async Task<Result<TestConnectionResultDto>> HandleAsync(TestStorageConnectionCommand command, CancellationToken ct)
    {
        if (command.ProviderType == StorageProviderType.StudioCloud)
        {
            return Result.Ok(new TestConnectionResultDto(true, "Studio Cloud storage connection is active."));
        }

        try
        {
            var s3Config = new AmazonS3Config
            {
                ServiceURL = command.ServiceUrl,
                ForcePathStyle = true,
                Timeout = TimeSpan.FromSeconds(10)
            };

            if (!string.IsNullOrWhiteSpace(command.Region))
            {
                s3Config.AuthenticationRegion = command.Region;
            }

            using var s3Client = new AmazonS3Client(command.AccessKey, command.SecretKey, s3Config);

            var listReq = new ListObjectsV2Request
            {
                BucketName = command.BucketName,
                MaxKeys = 1
            };

            await s3Client.ListObjectsV2Async(listReq, ct);

            return Result.Ok(new TestConnectionResultDto(true, $"Successfully connected to bucket '{command.BucketName}'."));
        }
        catch (AmazonS3Exception ex)
        {
            return Result.Ok(new TestConnectionResultDto(false, $"S3 Error ({ex.ErrorCode}): {ex.Message}"));
        }
        catch (Exception ex)
        {
            return Result.Ok(new TestConnectionResultDto(false, $"Connection error: {ex.Message}"));
        }
    }
}
