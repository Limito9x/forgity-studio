using Automation.Pipeline.BuildTime.Parsers;

namespace Automation.Pipeline.BuildTime.Services;

public record ScriptDependencyDto(string Module, string PackageName);

public interface IScriptSchemaAnalyzer
{
    Task<ParsedScriptSchemaResult> AnalyzeAsync(
        string scriptContent,
        string? fileName = null,
        CancellationToken ct = default);
}

