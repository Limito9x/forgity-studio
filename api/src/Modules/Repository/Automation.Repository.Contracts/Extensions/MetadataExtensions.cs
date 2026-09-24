using System.Text.Json;
using System.Text.RegularExpressions;
using Automation.Tag.Contracts.Dtos;
using Automation.Repository.Contracts.Dtos;

namespace Automation.Repository.Contracts.Extensions;

public static class MetadataExtensions
{
    /// <summary>
    /// Lấy giá trị (dạng object/string) từ trường dữ liệu của Metadata theo TagId
    /// </summary>
    public static object? GetValueByTagId(this ResourceMetadataDetailDto detail, Guid tagId)
    {
        if (detail.Metadata == null)
            return null;

        // Tìm entry trong TagMap có chứa TagId cần tìm
        var matchedEntry = detail.TagMap.FirstOrDefault(kvp =>
            kvp.Value.Any(t => t.TagId == tagId)
        );

        if (matchedEntry.Value == null || string.IsNullOrWhiteSpace(matchedEntry.Key))
            return null;

        return ExtractJsonValue(detail.Metadata.RootElement, matchedEntry.Key);
    }

    /// <summary>
    /// Lấy danh sách tất cả các giá trị gắn với TagId (trường hợp tag gắn ở nhiều field)
    /// </summary>
    public static IReadOnlyList<object> GetAllValuesByTagId(this ResourceMetadataDetailDto detail, Guid tagId)
    {
        if (detail.Metadata == null)
            return Array.Empty<object>();

        var matchedPaths = detail.TagMap
            .Where(kvp => kvp.Value.Any(t => t.TagId == tagId) && !string.IsNullOrWhiteSpace(kvp.Key))
            .Select(kvp => kvp.Key)
            .ToList();

        var values = new List<object>(matchedPaths.Count);
        foreach (var path in matchedPaths)
        {
            var val = ExtractJsonValue(detail.Metadata.RootElement, path);
            if (val is IEnumerable<object> list)
            {
                values.AddRange(list);
            }
            else if (val != null)
            {
                values.Add(val);
            }
        }

        return values;
    }

    /// <summary>
    /// Lấy danh sách tất cả các giá trị gắn với Tag (hỗ trợ cả TagId GUID, TagPath dạng 'Mesh.Body', hoặc TagName 'Body')
    /// </summary>
    public static IReadOnlyList<object> GetAllValuesByTag(this ResourceMetadataDetailDto detail, object? tagIdentifier)
    {
        if (detail.Metadata == null || tagIdentifier == null)
            return Array.Empty<object>();

        var raw = tagIdentifier.ToString()?.Trim();
        if (string.IsNullOrEmpty(raw))
            return Array.Empty<object>();

        Guid? tagGuid = null;
        if (Guid.TryParse(raw, out var parsedGuid))
        {
            tagGuid = parsedGuid;
        }
        else if (raw.Contains(':') && !raw.StartsWith('{'))
        {
            var lastColon = raw.LastIndexOf(':');
            if (lastColon >= 0 && Guid.TryParse(raw[(lastColon + 1)..].Trim(), out var suffixedGuid))
            {
                tagGuid = suffixedGuid;
            }
        }

        var matchedPaths = detail.TagMap
            .Where(kvp => kvp.Value.Any(t =>
                (tagGuid != null && t.TagId == tagGuid.Value) ||
                string.Equals(t.TagPath, raw, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(t.TagName, raw, StringComparison.OrdinalIgnoreCase) ||
                t.TagPath.EndsWith("." + raw, StringComparison.OrdinalIgnoreCase)
            ) && !string.IsNullOrWhiteSpace(kvp.Key))
            .Select(kvp => kvp.Key)
            .ToList();

        var values = new List<object>(matchedPaths.Count);
        foreach (var path in matchedPaths)
        {
            var val = ExtractJsonValue(detail.Metadata.RootElement, path);
            if (val is IEnumerable<object> list)
            {
                values.AddRange(list);
            }
            else if (val != null)
            {
                values.Add(val);
            }
        }

        return values;
    }

    /// <summary>
    /// Lấy giá trị (dạng object/string) từ trường dữ liệu của Metadata theo TagId cho ResourceBatchItemDto
    /// </summary>
    public static object? GetValueByTagId(this ResourceBatchItemDto detail, Guid tagId)
    {
        if (detail.Metadata == null)
            return null;

        var matchedEntry = detail.TagMap.FirstOrDefault(kvp =>
            kvp.Value.Any(t => t.TagId == tagId)
        );

        if (matchedEntry.Value == null || string.IsNullOrWhiteSpace(matchedEntry.Key))
            return null;

        return ExtractJsonValue(detail.Metadata.RootElement, matchedEntry.Key);
    }

    /// <summary>
    /// Lấy danh sách tất cả các giá trị gắn với TagId cho ResourceBatchItemDto
    /// </summary>
    public static IReadOnlyList<object> GetAllValuesByTagId(this ResourceBatchItemDto detail, Guid tagId)
    {
        if (detail.Metadata == null)
            return Array.Empty<object>();

        var matchedPaths = detail.TagMap
            .Where(kvp => kvp.Value.Any(t => t.TagId == tagId) && !string.IsNullOrWhiteSpace(kvp.Key))
            .Select(kvp => kvp.Key)
            .ToList();

        var values = new List<object>(matchedPaths.Count);
        foreach (var path in matchedPaths)
        {
            var val = ExtractJsonValue(detail.Metadata.RootElement, path);
            if (val is IEnumerable<object> list)
            {
                values.AddRange(list);
            }
            else if (val != null)
            {
                values.Add(val);
            }
        }

        return values;
    }


    private enum PathTokenType
    {
        Property,
        Index,
        Wildcard,
        Predicate
    }

    private sealed class PathToken
    {
        public PathTokenType Type { get; }
        public string Value { get; }
        public string? PredicateKey { get; }

        public PathToken(PathTokenType type, string value, string? predicateKey = null)
        {
            Type = type;
            Value = value;
            PredicateKey = predicateKey;
        }
    }

    private static readonly string[] CommonIdentityKeys = ["name", "slot", "id", "key", "type", "label"];

    /// <summary>
    /// Trích xuất giá trị từ JsonElement theo đường dẫn JSONPath (hỗ trợ dot notation, array indexing: "slots[0].name",
    /// wildcard: "slots[*].name", và RFC 9535 Semantic Identity Predicate: "slots[name='Trim-1'].textures.BASE_COLOR", "streams[type='audio'].codec").
    /// </summary>
    public static object? ExtractJsonValue(this JsonElement root, string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return GetElementValue(root);

        var tokens = ParsePathTokens(path);
        if (tokens.Count == 0)
            return GetElementValue(root);

        return TraverseTokens(root, tokens, 0);
    }

    private static List<PathToken> ParsePathTokens(string path)
    {
        var tokens = new List<PathToken>();
        var cleanPath = path.TrimStart('$', '.', '/');
        var len = cleanPath.Length;
        var i = 0;
        var sb = new System.Text.StringBuilder();

        while (i < len)
        {
            var ch = cleanPath[i];

            if (ch == '.' || ch == '/')
            {
                if (sb.Length > 0)
                {
                    tokens.Add(new PathToken(PathTokenType.Property, sb.ToString()));
                    sb.Clear();
                }
                i++;
            }
            else if (ch == '[')
            {
                if (sb.Length > 0)
                {
                    tokens.Add(new PathToken(PathTokenType.Property, sb.ToString()));
                    sb.Clear();
                }

                i++; // skip '['
                var insideSb = new System.Text.StringBuilder();
                var inSingleQuote = false;
                var inDoubleQuote = false;

                while (i < len)
                {
                    var c = cleanPath[i];
                    if (c == '\'' && !inDoubleQuote)
                    {
                        inSingleQuote = !inSingleQuote;
                        insideSb.Append(c);
                    }
                    else if (c == '"' && !inSingleQuote)
                    {
                        inDoubleQuote = !inDoubleQuote;
                        insideSb.Append(c);
                    }
                    else if (c == ']' && !inSingleQuote && !inDoubleQuote)
                    {
                        i++; // skip ']'
                        break;
                    }
                    else
                    {
                        insideSb.Append(c);
                    }
                    i++;
                }

                var content = insideSb.ToString().Trim();
                if (content == "*")
                {
                    tokens.Add(new PathToken(PathTokenType.Wildcard, "*"));
                }
                else if (int.TryParse(content, out _))
                {
                    tokens.Add(new PathToken(PathTokenType.Index, content));
                }
                else if (content.Contains('='))
                {
                    var eqIdx = content.IndexOf('=');
                    var key = content[..eqIdx].Trim();
                    var rawVal = content[(eqIdx + 1)..].Trim();
                    var val = Unquote(rawVal);
                    tokens.Add(new PathToken(PathTokenType.Predicate, val, key));
                }
                else if (!string.IsNullOrWhiteSpace(content))
                {
                    var val = Unquote(content);
                    tokens.Add(new PathToken(PathTokenType.Predicate, val, null));
                }
            }
            else
            {
                sb.Append(ch);
                i++;
            }
        }

        if (sb.Length > 0)
        {
            tokens.Add(new PathToken(PathTokenType.Property, sb.ToString()));
        }

        return tokens;
    }

    private static string Unquote(string raw)
    {
        if (raw.Length >= 2 && ((raw.StartsWith('\'') && raw.EndsWith('\'')) || (raw.StartsWith('"') && raw.EndsWith('"'))))
        {
            return raw[1..^1];
        }
        return raw;
    }

    private static object? TraverseTokens(JsonElement current, List<PathToken> tokens, int index)
    {
        if (index >= tokens.Count)
            return GetElementValue(current);

        var token = tokens[index];

        switch (token.Type)
        {
            case PathTokenType.Property:
                if (current.ValueKind == JsonValueKind.Object)
                {
                    if (current.TryGetProperty(token.Value, out var nextProp))
                    {
                        return TraverseTokens(nextProp, tokens, index + 1);
                    }

                    // Case-insensitive fallback
                    foreach (var prop in current.EnumerateObject())
                    {
                        if (string.Equals(prop.Name, token.Value, StringComparison.OrdinalIgnoreCase))
                        {
                            return TraverseTokens(prop.Value, tokens, index + 1);
                        }
                    }

                    // Semantic fallback: If an object container does not have the exact mesh name
                    // (e.g. mesh container changed between versions from "Genesis 9 Mouth Mesh" to "Laura")
                    // and the next token is a property (e.g. "slots"), find any child object that contains the next token!
                    if (index + 1 < tokens.Count && tokens[index + 1].Type == PathTokenType.Property)
                    {
                        var nextTokenValue = tokens[index + 1].Value;
                        foreach (var childObj in current.EnumerateObject())
                        {
                            if (childObj.Value.ValueKind == JsonValueKind.Object &&
                                (childObj.Value.TryGetProperty(nextTokenValue, out var targetProp) ||
                                 childObj.Value.EnumerateObject().Any(p => string.Equals(p.Name, nextTokenValue, StringComparison.OrdinalIgnoreCase))))
                            {
                                if (!childObj.Value.TryGetProperty(nextTokenValue, out targetProp))
                                {
                                    targetProp = childObj.Value.EnumerateObject().First(p => string.Equals(p.Name, nextTokenValue, StringComparison.OrdinalIgnoreCase)).Value;
                                }
                                var res = TraverseTokens(targetProp, tokens, index + 2);
                                if (res != null) return res;
                            }
                        }
                    }

                    return null;
                }
                else if (current.ValueKind == JsonValueKind.Array && int.TryParse(token.Value, out var arrIndex))
                {
                    if (arrIndex >= 0 && arrIndex < current.GetArrayLength())
                    {
                        return TraverseTokens(current[arrIndex], tokens, index + 1);
                    }
                    return null;
                }
                return null;

            case PathTokenType.Index:
                if (current.ValueKind == JsonValueKind.Array && int.TryParse(token.Value, out var idx))
                {
                    if (idx >= 0 && idx < current.GetArrayLength())
                    {
                        return TraverseTokens(current[idx], tokens, index + 1);
                    }
                }
                return null;

            case PathTokenType.Wildcard:
                if (current.ValueKind == JsonValueKind.Array)
                {
                    var list = new List<object>();
                    foreach (var item in current.EnumerateArray())
                    {
                        var childVal = TraverseTokens(item, tokens, index + 1);
                        if (childVal is IEnumerable<object> subList)
                            list.AddRange(subList);
                        else if (childVal != null)
                            list.Add(childVal);
                    }
                    return list.Count > 0 ? list : null;
                }
                return null;

            case PathTokenType.Predicate:
                if (current.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in current.EnumerateArray())
                    {
                        if (item.ValueKind == JsonValueKind.Object)
                        {
                            if (!string.IsNullOrEmpty(token.PredicateKey))
                            {
                                if (TryGetPropertyCaseInsensitive(item, token.PredicateKey, out var propVal))
                                {
                                    var strVal = GetStringValue(propVal);
                                    if (string.Equals(strVal, token.Value, StringComparison.OrdinalIgnoreCase))
                                    {
                                        return TraverseTokens(item, tokens, index + 1);
                                    }
                                }
                            }
                            else
                            {
                                // Shorthand predicate: check common identity keys
                                foreach (var idKey in CommonIdentityKeys)
                                {
                                    if (TryGetPropertyCaseInsensitive(item, idKey, out var propVal))
                                    {
                                        var strVal = GetStringValue(propVal);
                                        if (string.Equals(strVal, token.Value, StringComparison.OrdinalIgnoreCase))
                                        {
                                            return TraverseTokens(item, tokens, index + 1);
                                        }
                                    }
                                }
                            }
                        }
                        else if (item.ValueKind == JsonValueKind.String)
                        {
                            if (string.Equals(item.GetString(), token.Value, StringComparison.OrdinalIgnoreCase))
                            {
                                return TraverseTokens(item, tokens, index + 1);
                            }
                        }
                    }
                }
                return null;

            default:
                return null;
        }
    }

    private static bool TryGetPropertyCaseInsensitive(JsonElement element, string propName, out JsonElement value)
    {
        if (element.TryGetProperty(propName, out value))
            return true;

        foreach (var prop in element.EnumerateObject())
        {
            if (string.Equals(prop.Name, propName, StringComparison.OrdinalIgnoreCase))
            {
                value = prop.Value;
                return true;
            }
        }

        value = default;
        return false;
    }

    private static string? GetStringValue(JsonElement element) =>
        element.ValueKind switch
        {
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Number => element.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => null
        };

    private static object? GetElementValue(JsonElement element) =>
        element.ValueKind switch
        {
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Number => element.TryGetInt64(out var l)
                ? l
                : element.TryGetDouble(out var d)
                    ? d
                    : element.GetRawText(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Array => element.EnumerateArray().Select(GetElementValue).Where(x => x != null).ToList()!,
            JsonValueKind.Object => element.EnumerateObject().ToDictionary(p => p.Name, p => GetElementValue(p.Value), StringComparer.OrdinalIgnoreCase),
            JsonValueKind.Null or JsonValueKind.Undefined => null,
            _ => element.GetRawText()
        };
}

public static class TagMigrationHelper
{
    public static List<UpdatedTagLink> RealignTagPaths(
        JsonElement oldMetadata,
        JsonElement newMetadata,
        IReadOnlyList<TagLinkDetailDto> existingLinks)
    {
        var updatedLinks = new List<UpdatedTagLink>();

        foreach (var link in existingLinks)
        {
            var oldPath = !string.IsNullOrEmpty(link.TargetSubPath) ? link.TargetSubPath : ExtractPath(link.MetadataJson);
            if (string.IsNullOrWhiteSpace(oldPath))
                continue;

            // 1. Thuộc tính tĩnh không chứa index mảng -> Giữ nguyên
            if (!oldPath.Contains('['))
            {
                updatedLinks.Add(new(link.TagId, oldPath));
                continue;
            }

            // 2. Lấy giá trị cũ mà tag đang trỏ vào
            var capturedValue = oldMetadata.ExtractJsonValue(oldPath)?.ToString();
            if (string.IsNullOrEmpty(capturedValue))
                continue;

            // 3. Tách tên mảng và sub-path: "objects[1].name" -> array="objects", sub="name"
            var match = Regex.Match(oldPath, @"^([a-zA-Z0-9_]+)\[\d+\]\.(.*)$");
            if (!match.Success)
            {
                updatedLinks.Add(new(link.TagId, oldPath));
                continue;
            }

            var arrayPropName = match.Groups[1].Value;
            var subPath = match.Groups[2].Value;

            // 4. Dò tìm trong mảng mới xem phần tử nào có giá trị trùng khớp
            if (newMetadata.TryGetProperty(arrayPropName, out var newArray) && newArray.ValueKind == JsonValueKind.Array)
            {
                var newIndex = -1;
                for (int i = 0; i < newArray.GetArrayLength(); i++)
                {
                    var itemVal = newArray[i].ExtractJsonValue(subPath)?.ToString();
                    if (string.Equals(itemVal, capturedValue, StringComparison.OrdinalIgnoreCase))
                    {
                        newIndex = i;
                        break;
                    }
                }

                if (newIndex != -1)
                {
                    var newPath = $"{arrayPropName}[{newIndex}].{subPath}";
                    updatedLinks.Add(new(link.TagId, newPath));
                }
            }
        }

        return updatedLinks;
    }

    public static string ExtractPath(string? metadataJson)
    {
        if (string.IsNullOrWhiteSpace(metadataJson))
            return string.Empty;

        try
        {
            using var doc = JsonDocument.Parse(metadataJson);
            if (
                doc.RootElement.ValueKind == JsonValueKind.Object
                && doc.RootElement.TryGetProperty("path", out var pathProp)
            )
            {
                return pathProp.GetString() ?? string.Empty;
            }
        }
        catch (JsonException)
        {
            return string.Empty;
        }

        return string.Empty;
    }
}
