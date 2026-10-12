using System.Security.Cryptography;
using System.Text;
using Automation.SharedKernel.Abstractions.Security;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Automation.SharedKernel.Infrastructure.Security;

/// <summary>
/// Triển khai ISecretProtector bằng thuật toán AES-256-GCM (Authenticated Encryption).
/// Tự động kèm Nonce ngẫu nhiên và Authentication Tag (16 bytes) chống giả mạo dữ liệu.
/// </summary>
public class AesGcmSecretProtector : ISecretProtector
{
    private const string PayloadPrefix = "enc:v1:";
    private const byte CurrentVersion = 1;
    private const int NonceSizeBytes = 12; // 96 bits chuẩn cho GCM
    private const int TagSizeBytes = 16;   // 128 bits auth tag

    private readonly byte[] _keyBytes;
    private readonly ILogger<AesGcmSecretProtector>? _logger;

    public AesGcmSecretProtector(IConfiguration configuration, ILogger<AesGcmSecretProtector>? logger = null)
    {
        _logger = logger;

        var configuredKey = configuration["Security:EncryptionKey"]
            ?? configuration["Security:MasterEncryptionKey"]
            ?? "AutomationStudio-DefaultDevelopmentSecretKey-32B";

        // Chuẩn hóa Master Key thành đúng 256 bits (32 bytes) thông qua SHA-256
        _keyBytes = SHA256.HashData(Encoding.UTF8.GetBytes(configuredKey));
    }

    /// <summary>
    /// Constructor hỗ trợ chỉ định key trực tiếp (phục vụ Unit Test).
    /// </summary>
    public AesGcmSecretProtector(byte[] keyBytes, ILogger<AesGcmSecretProtector>? logger = null)
    {
        _logger = logger;
        _keyBytes = keyBytes.Length == 32 ? keyBytes : SHA256.HashData(keyBytes);
    }

    public string? Protect(string? plainText)
    {
        if (string.IsNullOrEmpty(plainText))
            return plainText;

        // Nếu chuỗi đã được mã hóa trước đó, không mã hóa lặp lại
        if (plainText.StartsWith(PayloadPrefix, StringComparison.Ordinal))
            return plainText;

        var plainBytes = Encoding.UTF8.GetBytes(plainText);
        var nonce = new byte[NonceSizeBytes];
        RandomNumberGenerator.Fill(nonce);

        var cipherBytes = new byte[plainBytes.Length];
        var tag = new byte[TagSizeBytes];

        using (var aesGcm = new AesGcm(_keyBytes, TagSizeBytes))
        {
            aesGcm.Encrypt(nonce, plainBytes, cipherBytes, tag);
        }

        // Đóng gói: [1 byte Version] + [12 bytes Nonce] + [16 bytes Tag] + [N bytes Ciphertext]
        var payload = new byte[1 + NonceSizeBytes + TagSizeBytes + cipherBytes.Length];
        payload[0] = CurrentVersion;
        Buffer.BlockCopy(nonce, 0, payload, 1, NonceSizeBytes);
        Buffer.BlockCopy(tag, 0, payload, 1 + NonceSizeBytes, TagSizeBytes);
        Buffer.BlockCopy(cipherBytes, 0, payload, 1 + NonceSizeBytes + TagSizeBytes, cipherBytes.Length);

        return PayloadPrefix + Convert.ToBase64String(payload);
    }

    public string? Unprotect(string? cipherText)
    {
        if (string.IsNullOrEmpty(cipherText))
            return cipherText;

        // Graceful Fallback: nếu chuỗi chưa có tiền tố enc:v1:, coi như là dữ liệu cũ chưa mã hóa
        if (!cipherText.StartsWith(PayloadPrefix, StringComparison.Ordinal))
            return cipherText;

        try
        {
            var base64Part = cipherText[PayloadPrefix.Length..];
            var payload = Convert.FromBase64String(base64Part);

            var minPayloadLength = 1 + NonceSizeBytes + TagSizeBytes;
            if (payload.Length < minPayloadLength)
            {
                _logger?.LogWarning("Encrypted payload length is invalid ({Length} bytes).", payload.Length);
                return cipherText;
            }

            var version = payload[0];
            if (version != CurrentVersion)
            {
                _logger?.LogWarning("Unsupported encrypted secret version: {Version}", version);
                return cipherText;
            }

            var nonce = new byte[NonceSizeBytes];
            var tag = new byte[TagSizeBytes];
            var cipherBytesLength = payload.Length - minPayloadLength;
            var cipherBytes = new byte[cipherBytesLength];

            Buffer.BlockCopy(payload, 1, nonce, 0, NonceSizeBytes);
            Buffer.BlockCopy(payload, 1 + NonceSizeBytes, tag, 0, TagSizeBytes);
            Buffer.BlockCopy(payload, minPayloadLength, cipherBytes, 0, cipherBytesLength);

            var plainBytes = new byte[cipherBytesLength];
            using (var aesGcm = new AesGcm(_keyBytes, TagSizeBytes))
            {
                aesGcm.Decrypt(nonce, cipherBytes, tag, plainBytes);
            }

            return Encoding.UTF8.GetString(plainBytes);
        }
        catch (CryptographicException ex)
        {
            _logger?.LogError(ex, "Failed to decrypt secret: Authentication tag verification failed or key mismatch.");
            return null;
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Unexpected error decrypting secret.");
            return null;
        }
    }
}
