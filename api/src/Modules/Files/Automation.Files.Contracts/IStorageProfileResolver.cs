namespace Automation.Files.Contracts;

public interface IStorageProfileResolver
{
    Task<StorageConfigDto?> ResolveProfileAsync(Guid storageProfileId, CancellationToken ct = default);
}
