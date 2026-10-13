using System.Collections.Concurrent;
using Automation.Files.Contracts;

namespace Automation.Files.Infrastructure.Tracking;

public enum StorageMigrationJobStatus
{
    Pending,
    Running,
    Completed,
    Failed
}

public class StorageMigrationJobState
{
    public Guid JobId { get; set; }
    public StorageMigrationJobStatus Status { get; set; } = StorageMigrationJobStatus.Pending;
    public Guid? TargetStorageProfileId { get; set; }
    public int TotalItems { get; set; }
    public int ProcessedItems { get; set; }
    public long TotalBytes { get; set; }
    public long TransferredBytes { get; set; }
    public string? CurrentFileName { get; set; }
    public double Percentage { get; set; }
    public List<MigrateAssetItemResult> Results { get; set; } = new();
    public string? ErrorMessage { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
}

public interface IStorageMigrationJobTracker
{
    void RegisterJob(Guid jobId, Guid? targetStorageProfileId, int totalItems);
    void UpdateProgress(StorageMigrationProgress progress);
    void CompleteJob(Guid jobId, IReadOnlyList<MigrateAssetItemResult> results);
    void FailJob(Guid jobId, string errorMessage);
    StorageMigrationJobState? GetJob(Guid jobId);
}

public class StorageMigrationJobTracker : IStorageMigrationJobTracker
{
    private readonly ConcurrentDictionary<Guid, StorageMigrationJobState> _jobs = new();

    public void RegisterJob(Guid jobId, Guid? targetStorageProfileId, int totalItems)
    {
        _jobs[jobId] = new StorageMigrationJobState
        {
            JobId = jobId,
            Status = StorageMigrationJobStatus.Pending,
            TargetStorageProfileId = targetStorageProfileId,
            TotalItems = totalItems,
            CreatedAt = DateTimeOffset.UtcNow
        };
    }

    public void UpdateProgress(StorageMigrationProgress progress)
    {
        if (_jobs.TryGetValue(progress.JobId, out var state))
        {
            state.Status = StorageMigrationJobStatus.Running;
            state.ProcessedItems = progress.ProcessedItems;
            state.TotalItems = progress.TotalItems;
            state.TotalBytes = progress.TotalBytes;
            state.TransferredBytes = progress.TransferredBytes;
            state.CurrentFileName = progress.CurrentFileName;
            state.Percentage = Math.Round(progress.Percentage, 2);
        }
    }

    public void CompleteJob(Guid jobId, IReadOnlyList<MigrateAssetItemResult> results)
    {
        if (_jobs.TryGetValue(jobId, out var state))
        {
            state.Status = StorageMigrationJobStatus.Completed;
            state.ProcessedItems = state.TotalItems;
            state.Percentage = 100.0;
            state.Results = results.ToList();
            state.CompletedAt = DateTimeOffset.UtcNow;
        }
    }

    public void FailJob(Guid jobId, string errorMessage)
    {
        if (_jobs.TryGetValue(jobId, out var state))
        {
            state.Status = StorageMigrationJobStatus.Failed;
            state.ErrorMessage = errorMessage;
            state.CompletedAt = DateTimeOffset.UtcNow;
        }
    }

    public StorageMigrationJobState? GetJob(Guid jobId)
    {
        return _jobs.TryGetValue(jobId, out var state) ? state : null;
    }
}
