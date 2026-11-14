using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace Automation.Files.Infrastructure.Storage;

public interface IObjectStorageService
{
    // Generate a presigned URL for client to upload directly to R2
    Task<string> GeneratePresignedUploadUrlAsync(string storagePath, string contentType, TimeSpan expiration, CancellationToken ct = default);
    
    // Retrieve the file size from S3 to verify the upload was successful and complete
    Task<long?> GetFileSizeAsync(string storagePath, CancellationToken ct = default);

    Task DeleteAsync(string storagePath, CancellationToken ct = default);
    Task DeleteFilesAsync(IEnumerable<string> storagePaths, CancellationToken ct = default);
    Task<List<string>> GetAllFilesAsync(CancellationToken ct = default);
    
    string GetPublicUrl(string storagePath);

    Task<Stream> OpenReadStreamAsync(string storagePath, CancellationToken ct = default);
    Task UploadStreamAsync(string storagePath, Stream contentStream, string contentType, long? expectedLength = null, CancellationToken ct = default);
    Task<bool> ExistsAsync(string storagePath, CancellationToken ct = default);
}


