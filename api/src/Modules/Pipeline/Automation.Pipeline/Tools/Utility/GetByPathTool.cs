using System.Collections;
using System.Text.Json;
using System.Text.RegularExpressions;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;

namespace Automation.Pipeline.Tools.Utility;

/// <summary>
/// Tool trích xuất dữ liệu từ JSON/Map bằng biểu thức JSONPath linh hoạt (Laser Extraction).
/// Hỗ trợ dot-notation (a.b), index ([0]), wildcard ([*]), và recursive descent (..property).
/// </summary>
public class GetByPathTool : IResolverTool
{
    public string Key => "GetByPath";
    public IReadOnlyList<string> Aliases => ["JsonPath", "ExtractPath", "GetPath"];
    public string Label => "Get By Path";
    public string? Category => "Utility";
    public bool IsPure => true;

    public (IReadOnlyList<PinDefinition> Inputs, IReadOnlyList<PinDefinition> Outputs) ResolvePins(
        Dictionary<string, object?>? configValues,
        IPinResolutionContext? context = null
    )
    {
        var path = configValues?.GetValueOrDefault("Path")?.ToString() ?? "$.slots[*]";
        var isArray = path.Contains("[*]") || path.EndsWith("[]") || path.Contains("..");
        var cardinality = isArray ? PinCardinality.Array : PinCardinality.Single;

        var dynamicOutputs = new List<PinDefinition>
        {
            new()
            {
                Id = "Result",
                Label = "Result",
                Kind = PinKind.Data,
                PrimitiveType = PinPrimitiveType.String,
                Cardinality = cardinality,
                IsRequired = true
            },
            new()
            {
                Id = "Found",
                Label = "Found",
                Kind = PinKind.Data,
                PrimitiveType = PinPrimitiveType.Boolean,
                Cardinality = PinCardinality.Single,
                IsRequired = true
            },
            new()
            {
                Id = "Count",
                Label = "Count",
                Kind = PinKind.Data,
                PrimitiveType = PinPrimitiveType.Number,
                Cardinality = PinCardinality.Single,
                IsRequired = true
            }
        };

        return (Inputs, dynamicOutputs);
    }

    public IReadOnlyList<PinDefinition> Inputs =>
    [
        new()
        {
            Id = "Source",
            Label = "Source",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Map,
            IsRequired = true
        },
        new()
        {
            Id = "Path",
            Label = "JSON Path",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = true,
            DefaultValue = "$.slots[*]"
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
        },
        new()
        {
            Id = "Found",
            Label = "Found",
            PrimitiveType = PinPrimitiveType.Boolean,
            Cardinality = PinCardinality.Single,
            IsRequired = true
        },
        new()
        {
            Id = "Count",
            Label = "Count",
            PrimitiveType = PinPrimitiveType.Number,
            Cardinality = PinCardinality.Single,
            IsRequired = true
        }
    ];

    public Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        var sourceObj = inputs.GetValueOrDefault("Source") ?? inputs.GetValueOrDefault("source");
        var path = inputs.GetValueOrDefault("Path")?.ToString() ??
                   inputs.GetValueOrDefault("path")?.ToString() ??
                   string.Empty;

        if (sourceObj == null || string.IsNullOrWhiteSpace(path))
        {
            return Task.FromResult(new Dictionary<string, object>
            {
                ["Result"] = string.Empty,
                ["Value"] = string.Empty,
                ["Values"] = new List<string>(),
                ["Found"] = false,
                ["Count"] = 0
            });
        }

        JsonElement rootElement;
        JsonDocument? ownedDoc = null;

        try
        {
            if (sourceObj is JsonElement je)
            {
                rootElement = je;
            }
            else if (sourceObj is JsonDocument jd)
            {
                rootElement = jd.RootElement;
            }
            else if (sourceObj is string str)
            {
                var trimmed = str.Trim();
                if ((trimmed.StartsWith('{') && trimmed.EndsWith('}')) || (trimmed.StartsWith('[') && trimmed.EndsWith(']')))
                {
                    ownedDoc = JsonDocument.Parse(trimmed);
                    rootElement = ownedDoc.RootElement;
                }
                else
                {
                    ownedDoc = JsonDocument.Parse(JsonSerializer.Serialize(str));
                    rootElement = ownedDoc.RootElement;
                }
            }
            else
            {
                var json = JsonSerializer.Serialize(sourceObj);
                ownedDoc = JsonDocument.Parse(json);
                rootElement = ownedDoc.RootElement;
            }

            var matchedElements = JsonPathEvaluator.Evaluate(rootElement, path);
            var values = new List<string>();

            foreach (var el in matchedElements)
            {
                values.Add(ConvertElementToString(el));
            }

            var isArray = path.Contains("[*]") || path.EndsWith("[]") || path.Contains("..");
            var firstVal = values.Count > 0 ? values[0] : string.Empty;
            var primaryResult = isArray ? (object)values : firstVal;

            var result = new Dictionary<string, object>
            {
                ["Result"] = primaryResult,
                ["Value"] = firstVal,
                ["Values"] = values,
                ["Found"] = values.Count > 0,
                ["Count"] = values.Count
            };

            return Task.FromResult(result);
        }
        catch
        {
            return Task.FromResult(new Dictionary<string, object>
            {
                ["Result"] = string.Empty,
                ["Value"] = string.Empty,
                ["Values"] = new List<string>(),
                ["Found"] = false,
                ["Count"] = 0
            });
        }
        finally
        {
            ownedDoc?.Dispose();
        }
    }

    private static string ConvertElementToString(JsonElement el)
    {
        return el.ValueKind switch
        {
            JsonValueKind.String => el.GetString() ?? string.Empty,
            JsonValueKind.Number => el.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            JsonValueKind.Null or JsonValueKind.Undefined => string.Empty,
            _ => el.GetRawText()
        };
    }
}

/// <summary>
/// Parser và Evaluator hỗ trợ biểu thức JSONPath thực dụng.
/// </summary>
public static class JsonPathEvaluator
{
    private record PathSegment(bool IsRecursive, string Target, bool IsIndex, int Index, bool IsWildcard);

    public static List<JsonElement> Evaluate(JsonElement root, string path)
    {
        var segments = ParseSegments(path);
        var current = new List<JsonElement> { root };

        foreach (var seg in segments)
        {
            var next = new List<JsonElement>();

            if (seg.IsRecursive)
            {
                var allDescendants = new List<JsonElement>();
                foreach (var el in current)
                {
                    CollectAllDescendants(el, allDescendants);
                }

                foreach (var desc in allDescendants)
                {
                    ApplySegmentToSingleElement(desc, seg, next);
                }
            }
            else
            {
                foreach (var el in current)
                {
                    ApplySegmentToSingleElement(el, seg, next);
                }
            }

            current = next;
            if (current.Count == 0)
            {
                break;
            }
        }

        return current;
    }

    private static void ApplySegmentToSingleElement(JsonElement el, PathSegment seg, List<JsonElement> destination)
    {
        if (seg.IsWildcard)
        {
            if (el.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in el.EnumerateArray())
                {
                    destination.Add(item);
                }
            }
            else if (el.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in el.EnumerateObject())
                {
                    destination.Add(prop.Value);
                }
            }
        }
        else if (seg.IsIndex)
        {
            if (el.ValueKind == JsonValueKind.Array)
            {
                var count = el.GetArrayLength();
                if (seg.Index >= 0 && seg.Index < count)
                {
                    destination.Add(el[seg.Index]);
                }
            }
        }
        else
        {
            if (el.ValueKind == JsonValueKind.Object)
            {
                if (el.TryGetProperty(seg.Target, out var val))
                {
                    destination.Add(val);
                }
                else
                {
                    // Case-insensitive fallback
                    foreach (var prop in el.EnumerateObject())
                    {
                        if (string.Equals(prop.Name, seg.Target, StringComparison.OrdinalIgnoreCase))
                        {
                            destination.Add(prop.Value);
                            break;
                        }
                    }
                }
            }
        }
    }

    private static void CollectAllDescendants(JsonElement el, List<JsonElement> list)
    {
        list.Add(el);

        if (el.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in el.EnumerateObject())
            {
                CollectAllDescendants(prop.Value, list);
            }
        }
        else if (el.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in el.EnumerateArray())
            {
                CollectAllDescendants(item, list);
            }
        }
    }

    private static List<PathSegment> ParseSegments(string path)
    {
        var result = new List<PathSegment>();
        var clean = path.Trim();
        if (clean.StartsWith('$'))
        {
            clean = clean[1..];
        }

        var i = 0;
        var len = clean.Length;

        while (i < len)
        {
            var isRecursive = false;

            if (clean[i] == '.')
            {
                if (i + 1 < len && clean[i + 1] == '.')
                {
                    isRecursive = true;
                    i += 2;
                }
                else
                {
                    i++;
                }

                if (i >= len) break;
            }

            if (clean[i] == '[')
            {
                var close = clean.IndexOf(']', i);
                if (close < 0) close = len;

                var bracketContent = clean.Substring(i + 1, close - i - 1).Trim();
                i = close + 1;

                if (bracketContent == "*" || string.IsNullOrEmpty(bracketContent))
                {
                    result.Add(new PathSegment(isRecursive, "*", false, -1, true));
                }
                else if (int.TryParse(bracketContent, out var idx))
                {
                    result.Add(new PathSegment(isRecursive, string.Empty, true, idx, false));
                }
                else
                {
                    var propName = bracketContent.Trim('\'', '"');
                    result.Add(new PathSegment(isRecursive, propName, false, -1, propName == "*"));
                }
            }
            else
            {
                var start = i;
                while (i < len && clean[i] != '.' && clean[i] != '[')
                {
                    i++;
                }

                var identifier = clean.Substring(start, i - start).Trim();
                if (!string.IsNullOrEmpty(identifier))
                {
                    var isWildcard = identifier == "*";
                    result.Add(new PathSegment(isRecursive, identifier, false, -1, isWildcard));
                }
            }
        }

        return result;
    }
}
