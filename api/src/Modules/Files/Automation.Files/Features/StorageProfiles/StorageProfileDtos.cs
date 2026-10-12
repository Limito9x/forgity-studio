using Automation.Files.Domain.Enums;

namespace Automation.Files.Features.StorageProfiles;

public record StorageProfileDto(
    Guid Id,
    Guid StudioId,
    string Name,
    StorageProviderType ProviderType,
    string BucketName,
    string ServiceUrl,
    string? Region,
    string? AccessKey,
    bool HasSecretKey,
    string? PublicBaseUrl,
    long UsedSizeBytes,
    long? StorageQuotaBytes,
    bool IsDefault,
    DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt
);

public record TestConnectionResultDto(
    bool Success,
    string Message
);
