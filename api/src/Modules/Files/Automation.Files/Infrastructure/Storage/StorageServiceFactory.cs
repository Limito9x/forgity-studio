using System.Collections.Concurrent;
using Amazon.S3;
using Automation.Files.Contracts;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Automation.Files.Infrastructure.Storage;

public class StorageServiceFactory : IStorageServiceFactory
{
    private readonly IObjectStorageService _defaultStorageService;
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<StorageServiceFactory> _logger;
    private readonly ConcurrentDictionary<Guid, IObjectStorageService> _clientCache = new();

    public StorageServiceFactory(
        IAmazonS3 defaultS3Client,
        IOptions<R2Options> defaultOptions,
        IServiceProvider serviceProvider,
        ILogger<StorageServiceFactory> logger
    )
    {
        _defaultStorageService = new R2StorageService(defaultS3Client, defaultOptions);
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public IObjectStorageService GetDefaultStorageService() => _defaultStorageService;

    public string GetPublicUrl(Guid? storageProfileId, string storagePath)
    {
        if (storageProfileId.HasValue && _clientCache.TryGetValue(storageProfileId.Value, out var cachedService))
        {
            return cachedService.GetPublicUrl(storagePath);
        }

        return _defaultStorageService.GetPublicUrl(storagePath);
    }

    public async Task<IObjectStorageService> GetStorageServiceAsync(Guid? storageProfileId = null, CancellationToken ct = default)
    {
        if (!storageProfileId.HasValue || storageProfileId.Value == Guid.Empty)
        {
            return _defaultStorageService;
        }

        if (_clientCache.TryGetValue(storageProfileId.Value, out var cachedService))
        {
            return cachedService;
        }

        var resolver = _serviceProvider.GetService<IStorageProfileResolver>();
        if (resolver == null)
        {
            _logger.LogWarning("No IStorageProfileResolver registered. Falling back to default storage for Profile '{ProfileId}'.", storageProfileId.Value);
            return _defaultStorageService;
        }

        var config = await resolver.ResolveProfileAsync(storageProfileId.Value, ct);
        if (config == null || config.IsStudioCloud)
        {
            _clientCache[storageProfileId.Value] = _defaultStorageService;
            return _defaultStorageService;
        }

        var s3Config = new AmazonS3Config
        {
            ServiceURL = config.ServiceUrl,
            ForcePathStyle = true,
        };

        if (!string.IsNullOrWhiteSpace(config.Region))
        {
            s3Config.AuthenticationRegion = config.Region;
        }

        var s3Client = new AmazonS3Client(config.AccessKey, config.SecretKey, s3Config);
        var service = new S3StorageService(s3Client, config.BucketName, config.PublicBaseUrl);

        _clientCache[storageProfileId.Value] = service;
        return service;
    }

    public void InvalidateCache(Guid storageProfileId)
    {
        _clientCache.TryRemove(storageProfileId, out _);
    }
}

