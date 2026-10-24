using System.Text.RegularExpressions;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using TreeSitter;
namespace Automation.Pipeline.BuildTime.Parsers;

public record ParsedScriptSchemaResult(
    string SuggestedName,
    string SuggestedLabel,
    string Executor,
    string? Description,
    List<PinDefinition> Inputs,
    List<PinDefinition> Outputs
);

public static class PythonScriptSchemaParser
{
    public static ParsedScriptSchemaResult Parse(string scriptContent, string? fileName = null)
    {
        var suggestedName = !string.IsNullOrWhiteSpace(fileName)
            ? Path.GetFileNameWithoutExtension(fileName)
            : "CustomScriptNode";

        var suggestedLabel = ToLabel(suggestedName);
        var executor = (scriptContent.Contains("import unreal") || scriptContent.Contains("from unreal import"))
            ? "unreal"
            : (scriptContent.Contains("import bpy") || scriptContent.Contains("from bpy import") ? "blender" : "python");

        var inputs = new List<PinDefinition>();
        var outputs = new List<PinDefinition>();
        string? description = null;

        try
        {
            using var lang = new Language("python");
            using var parser = new Parser(lang);
            using var tree = parser.Parse(scriptContent);
            if (tree?.RootNode == null)
            {
                return new ParsedScriptSchemaResult(suggestedName, suggestedLabel, executor, null, inputs, outputs);
            }

            var root = tree.RootNode;

            // 1. Check for function alias e.g. `main = custom_entry_point`
            string? aliasName = null;
            foreach (var child in root.NamedChildren)
            {
                if (child.Type == "assignment" && child.NamedChildren.Count >= 2 && child.NamedChildren[0].Text == "main")
                {
                    aliasName = child.NamedChildren[1].Text;
                    break;
                }
            }

            // 2. Locate target entry point function (main > alias > run > execute > first top-level function)
            var allFuncs = FindTopLevelFunctions(root);
            Node? targetFunc = null;

            if (!string.IsNullOrEmpty(aliasName))
            {
                targetFunc = allFuncs.FirstOrDefault(f => GetFunctionName(f) == aliasName);
            }

            targetFunc ??= allFuncs.FirstOrDefault(f => GetFunctionName(f) == "main")
                        ?? allFuncs.FirstOrDefault(f => GetFunctionName(f) == "run")
                        ?? allFuncs.FirstOrDefault(f => GetFunctionName(f) == "execute")
                        ?? allFuncs.FirstOrDefault();

            if (targetFunc != null)
            {
                var func = targetFunc;

                // 3. Extract docstring if present
                var blockNode = func.NamedChildren.FirstOrDefault(c => c.Type == "block");
                if (blockNode != null && blockNode.NamedChildren.Count > 0)
                {
                    var firstStmt = blockNode.NamedChildren[0];
                    if (firstStmt.Type == "expression_statement" && firstStmt.NamedChildren.Count > 0)
                    {
                        var expr = firstStmt.NamedChildren[0];
                        if (expr.Type == "string")
                        {
                            var rawDoc = expr.Text.Trim();
                            if ((rawDoc.StartsWith("\"\"\"") && rawDoc.EndsWith("\"\"\"")) || (rawDoc.StartsWith("'''") && rawDoc.EndsWith("'''")))
                                description = rawDoc.Length >= 6 ? rawDoc[3..^3].Trim() : string.Empty;
                            else if ((rawDoc.StartsWith('"') && rawDoc.EndsWith('"')) || (rawDoc.StartsWith('\'') && rawDoc.EndsWith('\'')))
                                description = rawDoc.Length >= 2 ? rawDoc[1..^1].Trim() : string.Empty;
                        }
                    }
                }

                // 4. Extract parameters into Input Pins
                var paramsNode = func.NamedChildren.FirstOrDefault(c => c.Type == "parameters");
                if (paramsNode != null)
                {
                    foreach (var p in paramsNode.NamedChildren)
                    {
                        var pin = ParseParamNode(p);
                        if (pin != null)
                        {
                            inputs.Add(pin);
                        }
                    }
                }

                // 5. Extract return statements strictly belonging to this function (never enter nested functions)
                if (blockNode != null)
                {
                    var returnStatements = new List<Node>();
                    CollectReturnStatements(blockNode, returnStatements);

                    foreach (var retNode in returnStatements)
                    {
                        if (retNode.NamedChildren.Count == 0) continue;

                        var retVal = retNode.NamedChildren[0];
                        if (retVal.Type == "dictionary")
                        {
                            foreach (var pair in retVal.NamedChildren.Where(c => c.Type == "pair"))
                            {
                                if (pair.NamedChildren.Count >= 2)
                                {
                                    var keyText = pair.NamedChildren[0].Text.Trim('"', '\'');
                                    var valNode = pair.NamedChildren[1];
                                    var valCard = valNode.Type == "dictionary" ? PinCardinality.Map 
                                                : (valNode.Type == "list" ? PinCardinality.Array : (PinCardinality?)null);

                                    if (!outputs.Any(o => o.Id == keyText))
                                    {
                                        outputs.Add(CreateOutputPin(keyText, valCard));
                                    }
                                }
                            }
                        }
                        else if (retVal.Type == "identifier")
                        {
                            var varName = retVal.Text;
                            if (varName is not ("None" or "True" or "False") &&
                                !varName.StartsWith("mock_", StringComparison.OrdinalIgnoreCase) &&
                                !varName.StartsWith("_"))
                            {
                                var pinId = varName.EndsWith("_dict", StringComparison.OrdinalIgnoreCase) && varName.Length > 5
                                    ? varName[..^5]
                                    : (varName.Contains("manifest", StringComparison.OrdinalIgnoreCase) ? "manifest" : varName);

                                if (!outputs.Any(o => o.Id == pinId))
                                {
                                    outputs.Add(CreateOutputPin(pinId, PinCardinality.Map));
                                }
                            }
                        }
                    }
                }
            }
        }
        catch
        {
            // Fail-safe graceful empty return
        }

        return new ParsedScriptSchemaResult(
            suggestedName,
            suggestedLabel,
            executor,
            description,
            inputs,
            outputs
        );
    }

    private static List<Node> FindTopLevelFunctions(Node root)
    {
        var funcs = new List<Node>();
        foreach (var child in root.NamedChildren)
        {
            if (child.Type == "function_definition")
            {
                funcs.Add(child);
            }
            else if (child.Type is "if_statement" or "try_statement" or "with_statement")
            {
                foreach (var sub in child.NamedChildren)
                {
                    if (sub.Type == "block")
                    {
                        foreach (var blockChild in sub.NamedChildren)
                        {
                            if (blockChild.Type == "function_definition")
                            {
                                funcs.Add(blockChild);
                            }
                        }
                    }
                }
            }
        }
        return funcs;
    }

    private static string GetFunctionName(Node funcNode)
    {
        var idNode = funcNode.NamedChildren.FirstOrDefault(c => c.Type == "identifier");
        return idNode != null ? idNode.Text : string.Empty;
    }

    private static PinDefinition? ParseParamNode(Node param)
    {
        string name = "";
        string? typeStr = null;
        string? defaultStr = null;
        bool hasDefault = false;

        switch (param.Type)
        {
            case "identifier":
                name = param.Text;
                break;
            case "default_parameter":
                if (param.NamedChildren.Count >= 2)
                {
                    name = param.NamedChildren[0].Text;
                    defaultStr = param.NamedChildren[1].Text;
                    hasDefault = true;
                }
                break;
            case "typed_parameter":
                if (param.NamedChildren.Count >= 2)
                {
                    name = param.NamedChildren[0].Text;
                    typeStr = param.NamedChildren[1].Text;
                }
                break;
            case "typed_default_parameter":
                if (param.NamedChildren.Count >= 3)
                {
                    name = param.NamedChildren[0].Text;
                    typeStr = param.NamedChildren[1].Text;
                    defaultStr = param.NamedChildren[2].Text;
                    hasDefault = true;
                }
                break;
            default:
                return null;
        }

        if (string.IsNullOrWhiteSpace(name) || name is "self" or "*args" or "**kwargs")
            return null;

        return BuildPinDefinition(name, typeStr, defaultStr, hasDefault);
    }

    private static void CollectReturnStatements(Node node, List<Node> returns)
    {
        foreach (var child in node.NamedChildren)
        {
            if (child.Type == "return_statement")
            {
                returns.Add(child);
            }
            else if (child.Type is "function_definition" or "class_definition")
            {
                // CRUCIAL: Do not descend into nested functions or classes
                continue;
            }
            else
            {
                CollectReturnStatements(child, returns);
            }
        }
    }

    private static PinDefinition CreateOutputPin(string outKey, PinCardinality? explicitCardinality = null)
    {
        var lower = outKey.ToLowerInvariant();

        var cardinality = explicitCardinality ?? lower switch
        {
            _ when lower.Contains("dict") || lower is "objects" or "manifest" or "metadata" or "map" || lower.EndsWith("_map")
                => PinCardinality.Map,

            _ when lower.EndsWith("s") && !lower.EndsWith("pass")
                => PinCardinality.Array,

            _ => PinCardinality.Single
        };

        return new PinDefinition
        {
            Id = outKey,
            Label = ToLabel(outKey),
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = cardinality,
            IsRequired = true
        };
    }

    private static PinDefinition BuildPinDefinition(string name, string? typeStr, string? defaultStr, bool hasDefault)
    {
        var (primitiveType, cardinality) = ResolveTypeAndCardinality(typeStr, name, defaultStr);
        var parsedDefault = ParseDefaultValue(defaultStr, primitiveType, hasDefault);

        return new PinDefinition
        {
            Id = name,
            Label = ToLabel(name),
            PrimitiveType = primitiveType,
            Cardinality = cardinality,
            IsRequired = !hasDefault,
            DefaultValue = parsedDefault
        };
    }

    private static (PinPrimitiveType Primitive, PinCardinality Cardinality) ResolveTypeAndCardinality(
        string? typeStr,
        string name,
        string? defaultStr
    )
    {
        var type = (typeStr ?? string.Empty).ToLowerInvariant();
        var lowerName = name.ToLowerInvariant();
        var def = defaultStr?.Trim();

        return type switch
        {
            _ when type.Contains("dict") || type.Contains("map") || type.Contains("mapping") || def?.StartsWith('{') == true
                => (PinPrimitiveType.String, PinCardinality.Map),

            _ when type.Contains("list") || type.Contains("[]") || type.Contains("array") || type.Contains("set") || def?.StartsWith('[') == true
                => (ResolveListElementPrimitive(type, lowerName), PinCardinality.Array),

            _ when type.Contains("bool") || def is "True" or "False"
                => (PinPrimitiveType.Boolean, PinCardinality.Single),

            _ when type.Contains("int") || type.Contains("float") || type.Contains("number") || (def != null && double.TryParse(def, out _))
                => (PinPrimitiveType.Number, PinCardinality.Single),

            _ => (PinPrimitiveType.String, PinCardinality.Single)
        };
    }

    private static PinPrimitiveType ResolveListElementPrimitive(string type, string _name) =>
        type switch
        {
            _ when type.Contains("int") || type.Contains("float") => PinPrimitiveType.Number,
            _ => PinPrimitiveType.String
        };

    private static object? ParseDefaultValue(string? defaultStr, PinPrimitiveType primitiveType, bool hasDefault)
    {
        if (!hasDefault || string.IsNullOrWhiteSpace(defaultStr)) return null;

        var clean = defaultStr.Trim('"', '\'');
        return clean switch
        {
            "None" => null,
            _ when primitiveType == PinPrimitiveType.Boolean && bool.TryParse(clean.ToLower(), out var bVal) => bVal,
            _ when primitiveType == PinPrimitiveType.Number && double.TryParse(clean, out var nVal) => nVal,
            _ => clean
        };
    }

    private static string ToLabel(string key)
    {
        if (string.IsNullOrWhiteSpace(key)) return string.Empty;
        var words = Regex.Replace(key, "([a-z])([A-Z])", "$1 $2")
                         .Replace('_', ' ')
                         .Split(' ', StringSplitOptions.RemoveEmptyEntries);
        
        return string.Join(" ", words.Select(w => char.ToUpper(w[0]) + (w.Length > 1 ? w[1..] : "")));
    }
}
