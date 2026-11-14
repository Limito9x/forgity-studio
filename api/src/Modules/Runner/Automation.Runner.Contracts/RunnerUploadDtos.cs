namespace Automation.Runner.Contracts;

public record RunnerUploadItemDto(
    string FilePath,
    string PresignedUrl,
    string ContentType,
    Guid AssetId,
    Guid ResourceVersionId
);

public record RunnerUploadItemResultDto(
    Guid AssetId,
    Guid ResourceVersionId,
    bool Success,
    long BytesUploaded,
    string? ErrorMessage
);

public record RunnerUploadResultDto(
    string CommandId,
    bool Success,
    string? ErrorMessage,
    long TotalBytesUploaded,
    IReadOnlyList<RunnerUploadItemResultDto>? Items = null
);
