namespace Automation.Files.Contracts;

public record StorageConfigDto(
    string BucketName,
    string ServiceUrl,
    string? AccessKey = null,
    string? SecretKey = null,
    string? PublicBaseUrl = null,
    string? Region = null,
    bool IsStudioCloud = false,
    long? StorageQuotaBytes = null
);

