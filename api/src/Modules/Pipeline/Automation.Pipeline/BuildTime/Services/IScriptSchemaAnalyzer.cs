using Automation.Pipeline.BuildTime.Parsers;
using Automation.Pipeline.Domain.ValueObjects;

namespace Automation.Pipeline.BuildTime.Services;

public interface IScriptSchemaAnalyzer
{
    Task<ParsedScriptSchemaResult> AnalyzeAsync(
        string scriptContent,
        string? fileName = null,
        CancellationToken ct = default);
}

