using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Automation.Pipeline.BuildTime.Parsers;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.BuildTime.Services;

public class NativePythonScriptAnalyzer : IScriptSchemaAnalyzer
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly IConfiguration? _configuration;
    private readonly ILogger<NativePythonScriptAnalyzer>? _logger;
    private readonly string? _customPythonPath;
    private readonly string? _customScriptPath;
    private readonly Lazy<string?> _cachedPythonPath;
    private readonly Lazy<string?> _cachedScriptPath;

    public NativePythonScriptAnalyzer(
        IConfiguration? configuration = null,
        ILogger<NativePythonScriptAnalyzer>? logger = null,
        string? customPythonPath = null,
        string? customScriptPath = null)
    {
        _configuration = configuration;
        _logger = logger;
        _customPythonPath = customPythonPath;
        _customScriptPath = customScriptPath;

        _cachedPythonPath = new Lazy<string?>(ResolvePythonBinary);
        _cachedScriptPath = new Lazy<string?>(ResolveAnalyzerScriptPath);
    }

    public async Task<ParsedScriptSchemaResult> AnalyzeAsync(
        string scriptContent,
        string? fileName = null,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(scriptContent))
        {
            throw new ArgumentException("Script content cannot be empty.", nameof(scriptContent));
        }

        var pythonExe = _cachedPythonPath.Value;
        if (string.IsNullOrWhiteSpace(pythonExe))
        {
            throw new InvalidOperationException("Python executable could not be found on the host system.");
        }

        var analyzerScript = _cachedScriptPath.Value;
        if (string.IsNullOrWhiteSpace(analyzerScript) || !File.Exists(analyzerScript))
        {
            throw new FileNotFoundException($"Python analyzer sidecar script not found at '{analyzerScript}'.");
        }

        var targetFileName = !string.IsNullOrWhiteSpace(fileName) ? fileName : "script.py";
        var utf8NoBom = new UTF8Encoding(false);
        var psi = new ProcessStartInfo
        {
            FileName = pythonExe,
            Arguments = $"\"{analyzerScript}\" - \"{targetFileName}\"",
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardInputEncoding = utf8NoBom,
            StandardOutputEncoding = utf8NoBom,
            StandardErrorEncoding = utf8NoBom
        };

        using var process = new Process { StartInfo = psi };
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromMilliseconds(7000));

        try
        {
            if (!process.Start())
            {
                throw new InvalidOperationException("Failed to start Python analyzer process.");
            }

            // Pipe script content via StandardInput BaseStream without BOM and close to signal EOF
            var scriptBytes = utf8NoBom.GetBytes(scriptContent);
            await process.StandardInput.BaseStream.WriteAsync(scriptBytes, cts.Token);
            await process.StandardInput.BaseStream.FlushAsync(cts.Token);
            process.StandardInput.Close();

            var outputTask = process.StandardOutput.ReadToEndAsync(cts.Token);
            var errorTask = process.StandardError.ReadToEndAsync(cts.Token);

            await process.WaitForExitAsync(cts.Token);
            var output = await outputTask;
            var error = await errorTask;

            if (process.ExitCode != 0)
            {
                throw new InvalidOperationException(
                    $"Python analyzer exited with code {process.ExitCode}. Stderr: {error}");
            }

            if (string.IsNullOrWhiteSpace(output))
            {
                throw new InvalidOperationException("Python analyzer returned empty output.");
            }

            var pythonResult = JsonSerializer.Deserialize<PythonAnalysisResult>(output, JsonOptions)
                ?? throw new InvalidOperationException("Failed to deserialize Python analyzer output.");

            if (!string.IsNullOrWhiteSpace(pythonResult.Error))
            {
                throw new InvalidOperationException($"Python analyzer reported syntax error: {pythonResult.Error}");
            }

            return MapToSchemaResult(pythonResult, targetFileName);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested && cts.IsCancellationRequested)
        {
            TryKillProcess(process);
            throw new TimeoutException("Python analyzer process timed out after 7000ms.");
        }
        catch
        {
            TryKillProcess(process);
            throw;
        }
    }

    private static void TryKillProcess(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }
        }
        catch
        {
            // Ignore termination errors on dead or inaccessible processes
        }
    }

    private static ParsedScriptSchemaResult MapToSchemaResult(PythonAnalysisResult raw, string fallbackFileName)
    {
        var suggestedName = !string.IsNullOrWhiteSpace(raw.SuggestedName)
            ? raw.SuggestedName
            : Path.GetFileNameWithoutExtension(fallbackFileName);

        var suggestedLabel = !string.IsNullOrWhiteSpace(raw.SuggestedLabel)
            ? raw.SuggestedLabel
            : ToLabel(suggestedName);

        var inputs = raw.Inputs.Select(p => MapPin(p, true)).ToList();
        var outputs = raw.Outputs.Select(p => MapPin(p, false)).ToList();
        var dependencies = raw.Dependencies
            .Select(d => new ScriptDependencyDto(d.Module, d.PackageName))
            .ToList();

        return new ParsedScriptSchemaResult(
            suggestedName,
            suggestedLabel,
            raw.Executor ?? "python",
            raw.Description ?? raw.Summary,
            inputs,
            outputs,
            dependencies
        );
    }

    private static PinDefinition MapPin(PythonPinDto pin, bool isInput)
    {
        var primitiveType = (pin.DataType ?? string.Empty).ToLowerInvariant() switch
        {
            "number" or "int" or "float" => PinPrimitiveType.Number,
            "bool" or "boolean" => PinPrimitiveType.Boolean,
            "asset" or "file" => PinPrimitiveType.Asset,
            "entityref" => PinPrimitiveType.EntityRef,
            _ => PinPrimitiveType.String
        };

        var cardinality = (pin.Cardinality ?? string.Empty).ToLowerInvariant() switch
        {
            "array" or "list" => PinCardinality.Array,
            "map" or "dict" => PinCardinality.Map,
            _ => PinCardinality.Single
        };

        string? metadata = pin.Metadata;
        if (string.IsNullOrWhiteSpace(metadata) && pin.Options is { Count: > 0 })
        {
            metadata = JsonSerializer.Serialize(new { type = "select", options = pin.Options });
        }

        object? defaultValue = pin.DefaultValue;
        if (defaultValue is JsonElement element)
        {
            defaultValue = element.ValueKind switch
            {
                JsonValueKind.String => element.GetString(),
                JsonValueKind.Number when element.TryGetInt64(out var l) => l,
                JsonValueKind.Number => element.GetDouble(),
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.Null => null,
                _ => element.GetRawText()
            };
        }

        return new PinDefinition
        {
            Id = pin.Name,
            Label = !string.IsNullOrWhiteSpace(pin.Label) ? pin.Label : ToLabel(pin.Name),
            Kind = PinKind.Data,
            PrimitiveType = primitiveType,
            Cardinality = cardinality,
            IsRequired = isInput && pin.Required,
            DefaultValue = defaultValue,
            Metadata = metadata,
            Description = pin.Description
        };
    }

    private static string ToLabel(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return string.Empty;
        var parts = name.Split(new[] { '_', '-' }, StringSplitOptions.RemoveEmptyEntries);
        return string.Join(" ", parts.Select(p => char.ToUpperInvariant(p[0]) + p[1..]));
    }

    private string? ResolvePythonBinary()
    {
        if (!string.IsNullOrWhiteSpace(_customPythonPath))
        {
            return _customPythonPath;
        }

        var envPath = Environment.GetEnvironmentVariable("PYTHON_PATH");
        if (!string.IsNullOrWhiteSpace(envPath) && ProbeExecutable(envPath))
        {
            return envPath;
        }

        var configPath = _configuration?["Automation:PythonPath"];
        if (!string.IsNullOrWhiteSpace(configPath) && ProbeExecutable(configPath))
        {
            return configPath;
        }

        string[] candidates = OperatingSystem.IsWindows()
            ? ["python", "py", "python3"]
            : ["python3", "python"];

        foreach (var candidate in candidates)
        {
            if (ProbeExecutable(candidate))
            {
                return candidate;
            }
        }

        _logger?.LogWarning("No functional Python executable found on PATH or configuration.");
        return null;
    }

    private static bool ProbeExecutable(string candidate)
    {
        try
        {
            using var proc = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = candidate,
                    Arguments = "--version",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };
            if (!proc.Start()) return false;
            return proc.WaitForExit(1000) && proc.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }

    private string? ResolveAnalyzerScriptPath()
    {
        if (!string.IsNullOrWhiteSpace(_customScriptPath))
        {
            return _customScriptPath;
        }

        var envScript = Environment.GetEnvironmentVariable("ANALYZER_SCRIPT_PATH");
        if (!string.IsNullOrWhiteSpace(envScript) && File.Exists(envScript))
        {
            return envScript;
        }

        // 1. Output directory location: lib/analyzers/python_script_analyzer.py
        var baseDir = AppContext.BaseDirectory;
        var outputPath = Path.Combine(baseDir, "lib", "analyzers", "python_script_analyzer.py");
        if (File.Exists(outputPath))
        {
            return outputPath;
        }

        // 2. Dev / Test runner search: search up directory tree for api/lib/analyzers/python_script_analyzer.py
        var dir = new DirectoryInfo(baseDir);
        for (int i = 0; i < 6 && dir != null; i++)
        {
            var directLib = Path.Combine(dir.FullName, "lib", "analyzers", "python_script_analyzer.py");
            if (File.Exists(directLib)) return directLib;

            var apiLib = Path.Combine(dir.FullName, "api", "lib", "analyzers", "python_script_analyzer.py");
            if (File.Exists(apiLib)) return apiLib;

            dir = dir.Parent;
        }

        return outputPath;
    }

    private sealed class PythonAnalysisResult
    {
        public string? Error { get; set; }
        public string? SuggestedName { get; set; }
        public string? SuggestedLabel { get; set; }
        public string? Executor { get; set; }
        public string? Summary { get; set; }
        public string? Description { get; set; }
        public List<PythonPinDto> Inputs { get; set; } = [];
        public List<PythonPinDto> Outputs { get; set; } = [];
        public List<PythonDependencyDto> Dependencies { get; set; } = [];
        public List<string> Warnings { get; set; } = [];
    }

    private sealed class PythonPinDto
    {
        public string Name { get; set; } = string.Empty;
        public string? Label { get; set; }
        public string? DataType { get; set; }
        public string? Cardinality { get; set; }
        public bool Required { get; set; } = true;
        public object? DefaultValue { get; set; }
        public List<string>? Options { get; set; }
        public string? Metadata { get; set; }
        public string? Description { get; set; }
    }

    private sealed class PythonDependencyDto
    {
        public string Module { get; set; } = string.Empty;
        public string PackageName { get; set; } = string.Empty;
    }
}

