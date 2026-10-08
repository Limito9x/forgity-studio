using System;

namespace Automation.Files.Contracts;

public record AssetLinkDto(
    Guid AssetLinkId,
    Guid AssetId,
    string PublicUrl,
    string OriginalName,
    string ContentType,
    long SizeBytes,
    int SortOrder,
    string SlotKey,
    DateTimeOffset LinkedAt,
    string HashSha256 = ""
);



