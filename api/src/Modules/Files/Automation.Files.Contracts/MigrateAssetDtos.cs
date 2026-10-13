namespace Automation.Files.Contracts;

public record MigrateAssetItem(
    Guid AssetId,
    bool DeleteSource = false
);

public record MigrateAssetItemResult(
    Guid SourceAssetId,
    Guid? MigratedAssetId,
    string? StoragePath,
    bool IsSuccess,
    bool WasDeduplicated,
    string? ErrorMessage = null
);

public record StorageMigrationProgress(
    Guid JobId,
    int TotalItems,
    int ProcessedItems,
    long TransferredBytes,
    long TotalBytes,
    string CurrentFileName,
    double Percentage
);
