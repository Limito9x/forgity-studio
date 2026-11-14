using Automation.SharedKernel.Abstractions.Security;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Automation.SharedKernel.Infrastructure.Security;

/// <summary>
/// EF Core ValueConverter tự động mã hóa chuỗi khi ghi vào Database (INSERT / UPDATE)
/// và tự động giải mã chuỗi khi đọc từ Database lên memory (SELECT).
/// </summary>
public class EncryptedSecretConverter : ValueConverter<string, string>
{
    public EncryptedSecretConverter(ISecretProtector protector)
        : base(
            plainText => protector.Protect(plainText)!,
            cipherText => protector.Unprotect(cipherText)!
        )
    {
    }
}
