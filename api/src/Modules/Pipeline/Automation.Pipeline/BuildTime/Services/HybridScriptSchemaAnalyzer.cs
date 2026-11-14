using Automation.Pipeline.BuildTime.Parsers;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.BuildTime.Services;

public class HybridScriptSchemaAnalyzer : IScriptSchemaAnalyzer
{
    private readonly NativePythonScriptAnalyzer _nativeAnalyzer;
    private readonly ILogger<HybridScriptSchemaAnalyzer> _logger;

    public HybridScriptSchemaAnalyzer(
        NativePythonScriptAnalyzer nativeAnalyzer,
        ILogger<HybridScriptSchemaAnalyzer> logger)
    {
        _nativeAnalyzer = nativeAnalyzer;
        _logger = logger;
    }

    public async Task<ParsedScriptSchemaResult> AnalyzeAsync(
        string scriptContent,
        string? fileName = null,
        CancellationToken ct = default)
    {
        try
        {
            return await _nativeAnalyzer.AnalyzeAsync(scriptContent, fileName, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "Native Python script analyzer failed for file '{FileName}'. Falling back to TreeSitter parser. Error: {Message}",
                fileName ?? "unknown",
                ex.Message);

            return PythonScriptSchemaParser.Parse(scriptContent, fileName);
        }
    }
}

