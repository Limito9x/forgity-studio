namespace Automation.SharedKernel.Abstractions.Security;

/// <summary>
/// Dịch vụ mã hóa và giải mã hai chiều đối xứng (Symmetric Encryption) dành cho các khóa bí mật
/// của bên thứ ba (S3 Secret Access Key, AI API Keys, SMTP Password, Webhook Secrets...).
/// </summary>
public interface ISecretProtector
{
    /// <summary>
    /// Mã hóa chuỗi plaintext thành chuỗi ciphertext an toàn để lưu vào Database.
    /// Trả về null nếu đầu vào là null.
    /// </summary>
    string? Protect(string? plainText);

    /// <summary>
    /// Giải mã chuỗi ciphertext từ Database về lại chuỗi plaintext gốc để sử dụng.
    /// Tự động tương thích ngược: nếu chuỗi chưa được mã hóa (dữ liệu cũ), trả về nguyên văn.
    /// </summary>
    string? Unprotect(string? cipherText);
}
