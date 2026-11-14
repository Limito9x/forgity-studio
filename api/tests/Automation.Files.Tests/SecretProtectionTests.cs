using System.Security.Cryptography;
using System.Text;
using Automation.Files.Domain.Entities;
using Automation.Files.Domain.Enums;
using Automation.Files.Infrastructure.Persistence;
using Automation.SharedKernel.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Automation.Files.Tests;

public class SecretProtectionTests
{
    private readonly AesGcmSecretProtector _protector;

    public SecretProtectionTests()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Security:EncryptionKey"] = "SuperSecretTestMasterKey-ForUnitTests12345"
            })
            .Build();

        _protector = new AesGcmSecretProtector(config);
    }

    [Fact]
    public void Protect_WhenGivenPlainText_ReturnsEncryptedStringWithPrefix()
    {
        var plainText = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

        var encrypted = _protector.Protect(plainText);

        Assert.NotNull(encrypted);
        Assert.StartsWith("enc:v1:", encrypted);
        Assert.NotEqual(plainText, encrypted);
    }

    [Fact]
    public void Unprotect_WhenGivenEncryptedString_ReturnsOriginalPlainText()
    {
        var originalSecret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

        var encrypted = _protector.Protect(originalSecret);
        var decrypted = _protector.Unprotect(encrypted);

        Assert.Equal(originalSecret, decrypted);
    }

    [Fact]
    public void Protect_CalledTwiceOnSameSecret_ProducesDifferentCiphertextsDueToRandomNonce()
    {
        var secret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

        var enc1 = _protector.Protect(secret);
        var enc2 = _protector.Protect(secret);

        Assert.NotEqual(enc1, enc2);
        Assert.Equal(secret, _protector.Unprotect(enc1));
        Assert.Equal(secret, _protector.Unprotect(enc2));
    }

    [Fact]
    public void Unprotect_WhenGivenLegacyUnencryptedString_ReturnsOriginalAsGracefulFallback()
    {
        var legacyPlainSecret = "unencrypted_legacy_secret_key_12345";

        var result = _protector.Unprotect(legacyPlainSecret);

        Assert.Equal(legacyPlainSecret, result);
    }

    [Fact]
    public void Unprotect_WhenCiphertextIsTampered_ReturnsNullSafely()
    {
        var secret = "sensitive_ai_or_s3_token";
        var encrypted = _protector.Protect(secret)!;

        // Giả mạo 1 ký tự trong base64
        var tampered = encrypted.Substring(0, encrypted.Length - 4) + "AAAA";

        var result = _protector.Unprotect(tampered);

        Assert.Null(result);
    }

    [Fact]
    public async Task EfCore_StorageProfileSecretKey_IsEncryptedInPersistenceAndDecryptedInDomain()
    {
        using var connection = new Microsoft.Data.Sqlite.SqliteConnection("Data Source=:memory:");
        connection.Open();
        connection.CreateCollation("case_insensitive", (a, b) => string.Compare(a, b, StringComparison.OrdinalIgnoreCase));

        var options = new DbContextOptionsBuilder<FilesDbContext>()
            .UseSqlite(connection)
            .EnableServiceProviderCaching(false)
            .Options;

        var plainSecret = "s3_secret_key_production_secret_99999";
        var profileId = Guid.NewGuid();

        // 1. Tạo schema và lưu vào Database thông qua DbContext có gắn SecretProtector
        using (var writeDb = new FilesDbContext(options, _protector))
        {
            writeDb.Database.EnsureCreated();

            var profile = new StorageProfile(
                studioId: Guid.NewGuid(),
                name: "Secure S3 Profile",
                providerType: StorageProviderType.CustomS3,
                bucketName: "my-bucket",
                serviceUrl: "https://s3.amazonaws.com",
                accessKey: "AKIAIOSFODNN7EXAMPLE",
                secretKey: plainSecret
            )
            {
                Id = profileId
            };

            writeDb.StorageProfiles.Add(profile);
            await writeDb.SaveChangesAsync();
        }

        // 2. Đọc lên bằng DbContext có SecretProtector -> Tự động giải mã thành plainSecret
        using (var readDb = new FilesDbContext(options, _protector))
        {
            var profile = await readDb.StorageProfiles.FirstAsync(x => x.Id == profileId);
            Assert.Equal(plainSecret, profile.SecretKey);
        }

        // 3. Kiểm tra trực tiếp dữ liệu thô lưu trong bảng SQLite thông qua ADO.NET
        using (var cmd = connection.CreateCommand())
        {
            cmd.CommandText = "SELECT SecretKey FROM StorageProfiles LIMIT 1";
            var rawSecretInDb = (string?)cmd.ExecuteScalar();

            Assert.NotNull(rawSecretInDb);
            Assert.StartsWith("enc:v1:", rawSecretInDb);
            Assert.NotEqual(plainSecret, rawSecretInDb);
        }
    }
}
