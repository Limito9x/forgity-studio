namespace Automation.Files.Infrastructure.Storage;

public interface IStorageServiceFactory
{
    Task<IObjectStorageService> GetStorageServiceAsync(Guid? storageProfileId = null, CancellationToken ct = default);
    IObjectStorageService GetDefaultStorageService();
    string GetPublicUrl(Guid? storageProfileId, string storagePath);
    void InvalidateCache(Guid storageProfileId);
}

