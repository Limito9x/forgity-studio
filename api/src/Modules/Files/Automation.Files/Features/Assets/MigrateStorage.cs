using System.Security.Claims;
using Automation.Files.Contracts;
using Automation.Files.Infrastructure.Tracking;
using Automation.Notifications.Contracts.Messages;
using Automation.SharedKernel.Extensions.Results;
using FastEndpoints;
using FluentResults;
using FluentValidation;
using Microsoft.AspNetCore.Http;
using Wolverine;

namespace Automation.Files.Features.Assets;

// Request & Response DTOs
public record MigrateStorageRequest(
    List<MigrateAssetItem> Items,
    Guid? TargetStorageProfileId
);

public record MigrateStorageJobResponse(
    Guid JobId,
    string Message
);

public record ExecuteStorageMigrationCommand(
    Guid JobId,
    List<MigrateAssetItem> Items,
    Guid? TargetStorageProfileId,
    Guid? UserId
);

public record GetMigrationJobStatusQuery(Guid JobId);

// Validator
public class MigrateStorageRequestValidator : AbstractValidator<MigrateStorageRequest>
{
    public MigrateStorageRequestValidator()
    {
        RuleFor(x => x.Items)
            .NotEmpty().WithMessage("Items list cannot be empty.");
        RuleForEach(x => x.Items)
            .Must(x => x.AssetId != Guid.Empty).WithMessage("AssetId must not be empty.");
    }
}

// 1. Endpoint: Kích hoạt Migrate (Trả về 202 Accepted kèm JobId)
public class MigrateStorageEndpoint(
    IMessageBus bus,
    IStorageMigrationJobTracker jobTracker
) : Endpoint<MigrateStorageRequest, MigrateStorageJobResponse>
{
    public override void Configure()
    {
        Post("migrate");
        Group<AssetsGroup>();
    }

    public override async Task HandleAsync(MigrateStorageRequest req, CancellationToken ct)
    {
        var jobId = Guid.NewGuid();
        Guid? userId = null;
        var subClaim = User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!string.IsNullOrEmpty(subClaim) && Guid.TryParse(subClaim, out var parsedUid))
        {
            userId = parsedUid;
        }

        jobTracker.RegisterJob(jobId, req.TargetStorageProfileId, req.Items.Count);

        // Đẩy vào Wolverine background queue thực thi ngầm
        await bus.PublishAsync(new ExecuteStorageMigrationCommand(jobId, req.Items, req.TargetStorageProfileId, userId));

        await this.SendResultAsync(
            Result.Ok(new MigrateStorageJobResponse(jobId, "Storage migration job accepted and running in background.")),
            ct
        );
    }
}

// 2. Endpoint: Tra cứu tiến độ (Query Job Status qua SendResultAsync)
public class GetMigrationJobStatusEndpoint(IMessageBus bus) : Endpoint<GetMigrationJobStatusQuery, StorageMigrationJobState>
{
    public override void Configure()
    {
        Get("migrate-jobs/{jobId:guid}");
        Group<AssetsGroup>();
    }

    public override async Task HandleAsync(GetMigrationJobStatusQuery req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<StorageMigrationJobState>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class GetMigrationJobStatusHandler(IStorageMigrationJobTracker jobTracker)
{
    public Task<Result<StorageMigrationJobState>> HandleAsync(GetMigrationJobStatusQuery query, CancellationToken ct)
    {
        var job = jobTracker.GetJob(query.JobId);
        if (job == null)
        {
            return Task.FromResult(Result.Fail<StorageMigrationJobState>($"Storage migration job '{query.JobId}' not found."));
        }

        return Task.FromResult(Result.Ok(job));
    }
}

// 3. Background Handler: Wolverine Handler xử lý tác vụ Piped Stream
public class ExecuteStorageMigrationHandler(
    IAssetApi assetApi,
    IStorageMigrationJobTracker jobTracker,
    IMessageBus bus
)
{
    public async Task HandleAsync(ExecuteStorageMigrationCommand command, CancellationToken ct)
    {
        var progress = new Progress<StorageMigrationProgress>(p => jobTracker.UpdateProgress(p));

        try
        {
            var result = await assetApi.MigrateAssetsStorageAsync(
                command.Items,
                command.TargetStorageProfileId,
                progress,
                command.JobId,
                ct
            );

            if (result.IsSuccess)
            {
                jobTracker.CompleteJob(command.JobId, result.Value);

                if (command.UserId.HasValue)
                {
                    var successCount = result.Value.Count(r => r.IsSuccess);
                    await bus.PublishAsync(new SystemNotificationCreatedMessage(
                        UserId: command.UserId.Value,
                        Title: "Storage Migration Completed",
                        Message: $"Successfully migrated {successCount}/{command.Items.Count} assets to target storage.",
                        Type: "StorageMigration",
                        Severity: "Success"
                    ));
                }
            }
            else
            {
                var errorMsg = string.Join(", ", result.Errors.Select(e => e.Message));
                jobTracker.FailJob(command.JobId, errorMsg);

                if (command.UserId.HasValue)
                {
                    await bus.PublishAsync(new SystemNotificationCreatedMessage(
                        UserId: command.UserId.Value,
                        Title: "Storage Migration Failed",
                        Message: $"Failed to migrate assets: {errorMsg}",
                        Type: "StorageMigration",
                        Severity: "Error"
                    ));
                }
            }
        }
        catch (Exception ex)
        {
            jobTracker.FailJob(command.JobId, ex.Message);

            if (command.UserId.HasValue)
            {
                await bus.PublishAsync(new SystemNotificationCreatedMessage(
                    UserId: command.UserId.Value,
                    Title: "Storage Migration Failed",
                    Message: $"Unexpected error during asset migration: {ex.Message}",
                    Type: "StorageMigration",
                    Severity: "Error"
                ));
            }
        }
    }
}
