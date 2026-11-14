using Automation.Files.Infrastructure.Persistence;
using Automation.Files.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace Automation.Files.Jobs;

public class FileJobs(
    FilesDbContext dbContext,
    IStorageServiceFactory storageServiceFactory,
    ILogger<FileJobs> logger)
{
    private const int BatchSize = 1000;

    public async Task CleanupOrphanedFiles(CancellationToken ct = default)
    {
        logger.LogInformation("Start cleaning up (Orphaned Files)...");

        var thresholdDate = DateTimeOffset.UtcNow.AddHours(-24);
        var totalDeleted = 0;
        var lastId = Guid.Empty;

        while (!ct.IsCancellationRequested)
        {
            var batch = await dbContext.Assets
                .IgnoreQueryFilters()
                .Where(f => f.CreatedAt < thresholdDate)
                .Where(f => !dbContext.AssetLinks.Any(l => l.AssetId == f.Id))
                .Take(BatchSize)
                .Select(f => new { f.Id, f.StoragePath, f.StorageProfileId })
                .ToListAsync(ct);

            if (batch.Count == 0)
            {
                break;
            }

            logger.LogInformation("Processing batch {Count} of orphaned files.", batch.Count);

            var idsToDelete = batch.Select(x => x.Id).ToList();

            try
            {
                // Nhóm theo StorageProfileId để xóa file vật lý trên đúng bucket (Default S3 hoặc Custom S3 của khách)
                var profileGroups = batch.GroupBy(x => x.StorageProfileId);
                foreach (var group in profileGroups)
                {
                    try
                    {
                        var storageService = await storageServiceFactory.GetStorageServiceAsync(group.Key, ct);
                        var paths = group.Select(x => x.StoragePath).ToList();
                        await storageService.DeleteFilesAsync(paths, ct);
                    }
                    catch (Exception ex)
                    {
                        logger.LogWarning(ex, "Failed to delete physical files from Storage Profile {ProfileId}. File records will still be purged from DB.", group.Key);
                    }
                }

                var deletedInDb = await dbContext.Assets
                    .IgnoreQueryFilters()
                    .Where(f => idsToDelete.Contains(f.Id))
                    .ExecuteDeleteAsync(ct);

                if (deletedInDb == 0)
                {
                    logger.LogWarning("No records were deleted in DB for the current batch. Stopping to prevent infinite loop.");
                    break;
                }

                totalDeleted += deletedInDb;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "An error occurred during batch cleanup. Stopping.");
                throw;
            }
        }

        logger.LogInformation("Cleanup complete. Total orphaned files hard deleted: {TotalDeleted}", totalDeleted);
    }

    public async Task CleanupUntrackedStorageFiles(CancellationToken ct = default)
    {
        logger.LogInformation("Start cleaning up untracked files (Default Studio Cloud Storage only)...");

        // Chỉ áp dụng cho Default Storage của bản thân hệ thống, tuyệt đối không quét bucket của khách
        var defaultStorage = storageServiceFactory.GetDefaultStorageService();

        var allStorageFiles = await defaultStorage.GetAllFilesAsync(ct);
        var untrackedFiles = new HashSet<string>(allStorageFiles);
        
        logger.LogInformation("Found a total of {Count} files on Default Storage.", untrackedFiles.Count);

        if (untrackedFiles.Count == 0)
        {
            return;
        }

        var totalDbFilesProcessed = 0;

        while (!ct.IsCancellationRequested)
        {
            // Chỉ so khớp với các Asset thuộc Default Storage (StorageProfileId == null)
            var batch = await dbContext.Assets
                .IgnoreQueryFilters()
                .Where(f => f.StorageProfileId == null)
                .OrderBy(f => f.CreatedAt)
                .Skip(totalDbFilesProcessed)
                .Take(BatchSize)
                .Select(f => new { f.Id, f.StoragePath })
                .ToListAsync(ct);

            if (batch.Count == 0)
            {
                break;
            }

            foreach (var asset in batch)
            {
                untrackedFiles.Remove(asset.StoragePath);
            }

            totalDbFilesProcessed += batch.Count;
        }

        logger.LogInformation("Finished comparing with {Count} files in the Database.", totalDbFilesProcessed);

        if (untrackedFiles.Count > 0)
        {
            logger.LogInformation("Detected {Count} ghost files on Default Storage. Starting deletion...", untrackedFiles.Count);

            try
            {
                await defaultStorage.DeleteFilesAsync(untrackedFiles, ct);
                logger.LogInformation("Successfully deleted {Count} ghost files on Default Storage.", untrackedFiles.Count);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "An error occurred while deleting ghost files on Default Storage.");
                throw;
            }
        }
        else
        {
            logger.LogInformation("No ghost files detected on Default Storage. Everything is synchronized.");
        }
    }
}


