using System.Text.RegularExpressions;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;

namespace Automation.Pipeline.Tools.Utility;

/// <summary>
/// Tool định dạng chuỗi theo mẫu (Format String) tương tự node Format Text / Format String thuần túy trong Unreal Engine.
/// Nhận chuỗi Template và các giá trị tương ứng để sinh ra chuỗi kết quả (Result: String).
/// </summary>
public class FormatStringTool : IResolverTool
{
    public string Key => "FormatString";
    public string Label => "Format String";
    public string? Category => "Utility";
    public bool IsPure => true;

    public (IReadOnlyList<PinDefinition> Inputs, IReadOnlyList<PinDefinition> Outputs) ResolvePins(
        Dictionary<string, object?>? configValues,
        IPinResolutionContext? context = null
    )
    {
        var template = configValues?.GetValueOrDefault("Template")?.ToString() ??
                       configValues?.GetValueOrDefault("template")?.ToString() ??
                       "{folder}/{name}";

        var baseInputs = Inputs.ToList();
        if (string.IsNullOrWhiteSpace(template))
        {
            return (baseInputs, Outputs);
        }

        var matches = Regex.Matches(template, @"\{([\w\-]+)\}")
            .Select(m => m.Groups[1].Value)
            .Distinct(StringComparer.OrdinalIgnoreCase);

        foreach (var slot in matches)
        {
            if (slot.Equals("Template", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            baseInputs.Add(new PinDefinition
            {
                Id = slot,
                Label = slot,
                PrimitiveType = PinPrimitiveType.String,
                Cardinality = PinCardinality.Single,
                IsRequired = false
            });
        }

        return (baseInputs, Outputs);
    }

    public IReadOnlyList<PinDefinition> Inputs =>
    [
        new()
        {
            Id = "Template",
            Label = "Template",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = true,
            DefaultValue = "{folder}/{name}",
            Metadata = """{"role": "template-source"}"""
        }
    ];

    public IReadOnlyList<PinDefinition> Outputs =>
    [
        new()
        {
            Id = "Result",
            Label = "Result",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = true
        }
    ];

    public Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        var templateObj = inputs.GetValueOrDefault("Template") ??
                          inputs.GetValueOrDefault("template") ??
                          inputs.Values.FirstOrDefault();

        var template = templateObj?.ToString() ?? string.Empty;

        if (string.IsNullOrEmpty(template))
        {
            return Task.FromResult(new Dictionary<string, object>
            {
                ["Result"] = string.Empty
            });
        }

        var formatted = Regex.Replace(template, @"\{([\w\-]+)\}", match =>
        {
            var rawKey = match.Groups[1].Value;
            var normalizedKey = rawKey.Replace("-", "").Replace("_", "");

            foreach (var (k, v) in inputs)
            {
                var normK = k.Replace("-", "").Replace("_", "");
                if (string.Equals(normK, normalizedKey, StringComparison.OrdinalIgnoreCase))
                {
                    return v?.ToString() ?? string.Empty;
                }
            }

            return string.Empty;
        });

        var sanitized = SanitizePath(formatted);

        return Task.FromResult(new Dictionary<string, object>
        {
            ["Result"] = sanitized
        });
    }

    private static string SanitizePath(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;

        // 1. Chuẩn hóa dấu gạch chéo về '/'
        var normalized = input.Replace('\\', '/');

        // 2. Thu gọn nhiều dấu '/' liên tiếp thành 1 dấu '/' (trừ trường hợp UNC // ở đầu)
        normalized = Regex.Replace(normalized, @"/{2,}", "/");

        // 3. Cho phép dấu '/' cho đường dẫn thư mục, sanitize các ký tự đặc biệt bất hợp pháp còn lại
        var invalidChars = new HashSet<char>(Path.GetInvalidFileNameChars().Where(c => c != '/' && c != '\\' && c != ':'));
        var cleanChars = normalized.Select(c => invalidChars.Contains(c) ? '_' : c).ToArray();
        var result = new string(cleanChars).Trim();

        // 4. Nếu kết quả chỉ còn là "/" thì trả về rỗng
        if (result == "/") return string.Empty;

        return result;
    }
}
