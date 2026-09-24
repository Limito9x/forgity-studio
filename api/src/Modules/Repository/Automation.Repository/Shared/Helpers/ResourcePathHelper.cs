namespace Automation.Repository.Shared.Helpers;

public static class ResourcePathHelper
{
    private static readonly char[] InvalidChars = Path.GetInvalidFileNameChars();

    /// <summary>
    /// Chuẩn hóa tên extension (ví dụ: " .PSD " -> "psd" hoặc ".psd").
    /// </summary>
    /// <param name="extension">Chuỗi extension cần chuẩn hóa.</param>
    /// <param name="withLeadingDot">Có bao gồm dấu chấm ở đầu hay không (mặc định: false).</param>
    /// <returns>Chuỗi extension đã được chuẩn hóa về chữ thường, hoặc chuỗi rỗng nếu không hợp lệ.</returns>
    public static string NormalizeExtension(string? extension, bool withLeadingDot = false)
    {
        if (string.IsNullOrWhiteSpace(extension))
        {
            return string.Empty;
        }

        var normalized = extension.Trim().TrimStart('.').ToLowerInvariant();

        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        return withLeadingDot ? $".{normalized}" : normalized;
    }

    /// <summary>
    /// Kiểm tra xem tên extension có hợp lệ hay không.
    /// </summary>
    /// <param name="extension">Extension cần kiểm tra.</param>
    /// <returns>True nếu extension hợp lệ, ngược lại False.</returns>
    public static bool IsValidExtension(string? extension)
    {
        if (string.IsNullOrWhiteSpace(extension))
        {
            return false;
        }

        var trimmed = extension.Trim().TrimStart('.');
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return false;
        }

        // Không chứa khoảng trắng hoặc ký tự phân cách thư mục
        if (trimmed.Any(c => char.IsWhiteSpace(c) || c == '/' || c == '\\'))
        {
            return false;
        }

        // Không chứa ký tự không hợp lệ trong tên file
        return !trimmed.Any(c => InvalidChars.Contains(c));
    }

    /// <summary>
    /// Lấy extension từ đường dẫn file và chuẩn hóa.
    /// </summary>
    /// <param name="filePath">Đường dẫn file (hỗ trợ cả '/' và '\').</param>
    /// <param name="withLeadingDot">Có bao gồm dấu chấm ở đầu hay không (mặc định: false).</param>
    /// <returns>Extension đã được chuẩn hóa, hoặc chuỗi rỗng nếu file không có extension.</returns>
    public static string GetExtension(string? filePath, bool withLeadingDot = false)
    {
        if (string.IsNullOrWhiteSpace(filePath))
        {
            return string.Empty;
        }

        var ext = Path.GetExtension(filePath);
        return NormalizeExtension(ext, withLeadingDot);
    }

    /// <summary>
    /// Tạo tên thông minh cho file từ đường dẫn tương đối (relative path).
    /// Quy tắc:
    /// - Nếu có thư mục cha: trả về "parentFolder/file.ext" (ví dụ: "a/b/c.png" -> "b/c.png").
    /// - Nếu không có thư mục cha: trả về tên file "file.ext" (ví dụ: "c.png" -> "c.png").
    /// </summary>
    /// <param name="filePath">Đường dẫn tương đối của file.</param>
    /// <returns>Tên hiển thị thông minh.</returns>
    public static string GetSmartDisplayName(string? filePath)
    {
        if (string.IsNullOrWhiteSpace(filePath))
        {
            return string.Empty;
        }

        // Chuẩn hóa dấu phân cách thành '/' và loại bỏ dấu '/' ở 2 đầu
        var normalizedPath = filePath.Replace('\\', '/').Trim('/');
        var segments = normalizedPath.Split('/', StringSplitOptions.RemoveEmptyEntries);

        if (segments.Length == 0)
        {
            return string.Empty;
        }

        // Nếu chỉ có 1 phần tử (chỉ có tên file)
        if (segments.Length == 1)
        {
            return segments[0];
        }

        // Lấy thư mục cha trực tiếp và tên file: "parentFolder/fileName"
        var parentFolder = segments[^2];
        var fileName = segments[^1];

        return $"{parentFolder}/{fileName}";
    }
}
