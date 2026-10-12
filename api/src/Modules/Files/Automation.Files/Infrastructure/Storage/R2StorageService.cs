using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;

namespace Automation.Files.Infrastructure.Storage;

public class R2StorageService(IAmazonS3 s3Client, IOptions<R2Options> options) 
    : S3StorageService(s3Client, options.Value.BucketName, options.Value.PublicBaseUrl)
{
}


