using Automation.Files.Domain.Enums;

namespace Automation.Files.Domain.Entities;

public class StorageProfile : AuditableEntity
{
    public Guid StudioId { get; set; }
    public string Name { get; set; } = string.Empty;
    public StorageProviderType ProviderType { get; set; } = StorageProviderType.StudioCloud;

    public string BucketName { get; set; } = string.Empty;
    public string ServiceUrl { get; set; } = string.Empty;
    public string? Region { get; set; }
    public string? AccessKey { get; set; }
    public string? SecretKey { get; set; }
    public string? PublicBaseUrl { get; set; }

    public long? StorageQuotaBytes { get; set; }
    public bool IsDefault { get; set; }

    public StorageProfile() { }

    public StorageProfile(
        Guid studioId,
        string name,
        StorageProviderType providerType,
        string bucketName,
        string serviceUrl,
        string? region = null,
        string? accessKey = null,
        string? secretKey = null,
        string? publicBaseUrl = null,
        long? storageQuotaBytes = null,
        bool isDefault = false
    )
    {
        StudioId = studioId;
        Name = name;
        ProviderType = providerType;
        BucketName = bucketName;
        ServiceUrl = serviceUrl;
        Region = region;
        AccessKey = accessKey;
        SecretKey = secretKey;
        PublicBaseUrl = publicBaseUrl;
        StorageQuotaBytes = storageQuotaBytes;
        IsDefault = isDefault;
    }

    public void Update(
        string name,
        StorageProviderType providerType,
        string bucketName,
        string serviceUrl,
        string? region,
        string? accessKey,
        string? secretKey,
        string? publicBaseUrl,
        long? storageQuotaBytes,
        bool isDefault
    )
    {
        Name = name;
        ProviderType = providerType;
        BucketName = bucketName;
        ServiceUrl = serviceUrl;
        Region = region;
        if (!string.IsNullOrWhiteSpace(accessKey)) AccessKey = accessKey;
        if (!string.IsNullOrWhiteSpace(secretKey)) SecretKey = secretKey;
        PublicBaseUrl = publicBaseUrl;
        StorageQuotaBytes = storageQuotaBytes;
        IsDefault = isDefault;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void SetDefault(bool isDefault)
    {
        IsDefault = isDefault;
        UpdatedAt = DateTimeOffset.UtcNow;
    }
}
