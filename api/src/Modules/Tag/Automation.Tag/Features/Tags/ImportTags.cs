using System.Text.RegularExpressions;
using Automation.Tag.Domain.Entities;
using Automation.Tag.Infrastructure.Persistence;
using Wolverine.Attributes;

namespace Automation.Tag.Features.Tags;

public enum TagConflictStrategy
{
    Skip = 0,
    Update = 1
}

public record TagImportItemDto(
    string Path,
    string? Name = null,
    string? Color = null,
    string? Description = null
);

public record ImportTagsCommand(
    Guid ProjectId,
    TagConflictStrategy ConflictStrategy = TagConflictStrategy.Skip,
    List<TagImportItemDto>? Tags = null,
    string? CsvContent = null
);

public record TagImportError(int Index, string Path, string Reason);

public record ImportTagsResult(
    int TotalProcessed,
    int CreatedCount,
    int UpdatedCount,
    int SkippedCount,
    List<TagImportError> Errors
);

public partial class ImportTagsValidator : Validator<ImportTagsCommand>
{
    public ImportTagsValidator()
    {
        RuleFor(x => x.ProjectId).NotEmpty();
        RuleFor(x => x)
            .Must(x => (x.Tags != null && x.Tags.Count > 0) || !string.IsNullOrWhiteSpace(x.CsvContent))
            .WithMessage("Either Tags list or CsvContent must be provided.");
    }
}

public class ImportTagsEndpoint(IMessageBus bus) : Endpoint<ImportTagsCommand, ImportTagsResult>
{
    public override void Configure()
    {
        Post("import");
        Group<TagsGroup>();
        Permissions(P.Tag.Create);
        Description(x => x.WithName("ImportTags"));
    }

    public override async Task HandleAsync(ImportTagsCommand command, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<ImportTagsResult>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(TagDbContext))]
public partial class ImportTagsHandler(TagDbContext db)
{
    [GeneratedRegex(@"^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$")]
    private static partial Regex LtreePathRegex();

    [GeneratedRegex(@"^#[0-9a-fA-F]{6}$")]
    private static partial Regex HexColorRegex();

    public async Task<Result<ImportTagsResult>> HandleAsync(ImportTagsCommand command, CancellationToken ct)
    {
        var errors = new List<TagImportError>();
        var items = new List<TagImportItemDto>();

        // 1. Parse CSV if CsvContent provided and Tags is empty
        if ((command.Tags == null || command.Tags.Count == 0) && !string.IsNullOrWhiteSpace(command.CsvContent))
        {
            var parseResult = ParseCsv(command.CsvContent);
            items.AddRange(parseResult.Items);
            errors.AddRange(parseResult.Errors);
        }
        else if (command.Tags != null)
        {
            items.AddRange(command.Tags);
        }

        if (items.Count == 0 && errors.Count > 0)
        {
            return Result.Ok(new ImportTagsResult(0, 0, 0, 0, errors));
        }

        // 2. Validate & normalize input items
        var normalizedInputMap = new Dictionary<string, TagImportItemDto>(StringComparer.OrdinalIgnoreCase);

        for (var i = 0; i < items.Count; i++)
        {
            var item = items[i];
            var normalizedPath = NormalizePath(item.Path);

            if (string.IsNullOrWhiteSpace(normalizedPath))
            {
                errors.Add(new TagImportError(i, item.Path ?? string.Empty, "Tag path is required."));
                continue;
            }

            if (!LtreePathRegex().IsMatch(normalizedPath))
            {
                errors.Add(new TagImportError(i, normalizedPath, "Tag path must use dot notation with letters, numbers, or underscores (e.g. Character.Hero.Female)."));
                continue;
            }

            var color = NormalizeColor(item.Color);
            if (!string.IsNullOrWhiteSpace(item.Color) && color == null)
            {
                errors.Add(new TagImportError(i, normalizedPath, "Color must be hex format like #3b82f6."));
                continue;
            }

            var leafName = string.IsNullOrWhiteSpace(item.Name) ? GetLeafName(normalizedPath) : item.Name.Trim();

            normalizedInputMap[normalizedPath] = new TagImportItemDto(
                Path: normalizedPath,
                Name: leafName,
                Color: color,
                Description: string.IsNullOrWhiteSpace(item.Description) ? null : item.Description.Trim()
            );
        }

        // 3. Collect all paths including ancestor paths
        var allTargetPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var path in normalizedInputMap.Keys)
        {
            var segments = path.Split('.');
            var currentPrefix = "";
            for (var s = 0; s < segments.Length; s++)
            {
                currentPrefix = s == 0 ? segments[s] : $"{currentPrefix}.{segments[s]}";
                allTargetPaths.Add(currentPrefix);
            }
        }

        // 4. Fetch existing tags in this project
        var existingTags = await db.TagItems
            .Where(t => t.ProjectId == command.ProjectId)
            .ToListAsync(ct);

        var existingMap = existingTags.ToDictionary(t => (string)t.Path, t => t, StringComparer.OrdinalIgnoreCase);

        var createdCount = 0;
        var updatedCount = 0;
        var skippedCount = 0;

        // 5. Process hierarchically depth-by-depth
        var pathsByDepth = allTargetPaths
            .GroupBy(p => p.Split('.').Length)
            .OrderBy(g => g.Key);

        foreach (var depthGroup in pathsByDepth)
        {
            var newEntitiesInDepth = new List<TagItem>();

            foreach (var path in depthGroup)
            {
                var isExplicitItem = normalizedInputMap.TryGetValue(path, out var explicitItem);

                if (existingMap.TryGetValue(path, out var existingNode))
                {
                    if (isExplicitItem && explicitItem != null)
                    {
                        if (command.ConflictStrategy == TagConflictStrategy.Update)
                        {
                            var hasChange = false;
                            if (!string.IsNullOrWhiteSpace(explicitItem.Name) && existingNode.Name != explicitItem.Name)
                            {
                                existingNode.Name = explicitItem.Name;
                                hasChange = true;
                            }
                            if (explicitItem.Color != null && existingNode.Color != explicitItem.Color)
                            {
                                existingNode.Color = explicitItem.Color;
                                hasChange = true;
                            }
                            if (explicitItem.Description != null && existingNode.Description != explicitItem.Description)
                            {
                                existingNode.Description = explicitItem.Description;
                                hasChange = true;
                            }

                            if (hasChange)
                            {
                                updatedCount++;
                            }
                            else
                            {
                                skippedCount++;
                            }
                        }
                        else
                        {
                            skippedCount++;
                        }
                    }
                }
                else
                {
                    // New tag node to create
                    Guid? parentId = null;
                    if (path.Contains('.'))
                    {
                        var parentPath = path[..path.LastIndexOf('.')];
                        if (existingMap.TryGetValue(parentPath, out var parentNode))
                        {
                            parentId = parentNode.Id;
                        }
                    }

                    var name = explicitItem?.Name ?? GetLeafName(path);
                    var color = explicitItem?.Color;
                    var description = explicitItem?.Description;

                    var newTag = new TagItem(
                        projectId: command.ProjectId,
                        path: path,
                        name: name,
                        color: color,
                        description: description,
                        parentId: parentId
                    );

                    db.TagItems.Add(newTag);
                    newEntitiesInDepth.Add(newTag);
                    existingMap[path] = newTag;

                    if (isExplicitItem)
                    {
                        createdCount++;
                    }
                }
            }

            // Save after each depth level to materialize database IDs for subsequent child levels
            if (newEntitiesInDepth.Count > 0 || updatedCount > 0)
            {
                await db.SaveChangesAsync(ct);
            }
        }

        return Result.Ok(new ImportTagsResult(
            TotalProcessed: normalizedInputMap.Count,
            CreatedCount: createdCount,
            UpdatedCount: updatedCount,
            SkippedCount: skippedCount,
            Errors: errors
        ));
    }

    private static (List<TagImportItemDto> Items, List<TagImportError> Errors) ParseCsv(string csvContent)
    {
        var items = new List<TagImportItemDto>();
        var errors = new List<TagImportError>();

        var lines = csvContent.Split(["\r\n", "\r", "\n"], StringSplitOptions.None);
        if (lines.Length == 0) return (items, errors);

        var firstNonEmptyIndex = -1;
        for (var i = 0; i < lines.Length; i++)
        {
            var trimmed = lines[i].Trim();
            if (!string.IsNullOrWhiteSpace(trimmed) && !trimmed.StartsWith('#'))
            {
                firstNonEmptyIndex = i;
                break;
            }
        }

        if (firstNonEmptyIndex == -1) return (items, errors);

        // Detect header
        var headerCols = ParseCsvLine(lines[firstNonEmptyIndex]);
        var pathCol = -1;
        var nameCol = -1;
        var colorCol = -1;
        var descCol = -1;

        var hasHeader = false;
        for (var c = 0; c < headerCols.Count; c++)
        {
            var h = headerCols[c].Trim().ToLowerInvariant();
            if (h is "path" or "tag" or "tagpath") { pathCol = c; hasHeader = true; }
            else if (h is "name" or "label" or "leafname") { nameCol = c; hasHeader = true; }
            else if (h is "color" or "hexcolor") { colorCol = c; hasHeader = true; }
            else if (h is "description" or "desc" or "comment" or "category") { descCol = c; hasHeader = true; }
        }

        var startIndex = firstNonEmptyIndex;
        if (hasHeader)
        {
            startIndex = firstNonEmptyIndex + 1;
            if (pathCol == -1) pathCol = 0;
        }
        else
        {
            // Default column indexes if no header row detected
            pathCol = 0;
            nameCol = 1;
            colorCol = 2;
            descCol = 3;
        }

        for (var i = startIndex; i < lines.Length; i++)
        {
            var rawLine = lines[i].Trim();
            if (string.IsNullOrWhiteSpace(rawLine) || rawLine.StartsWith('#'))
                continue;

            var cols = ParseCsvLine(rawLine);
            if (pathCol >= cols.Count)
            {
                errors.Add(new TagImportError(i, rawLine, "Missing path column in CSV row."));
                continue;
            }

            var path = cols[pathCol].Trim();
            var name = nameCol >= 0 && nameCol < cols.Count ? cols[nameCol].Trim() : null;
            var color = colorCol >= 0 && colorCol < cols.Count ? cols[colorCol].Trim() : null;
            var desc = descCol >= 0 && descCol < cols.Count ? cols[descCol].Trim() : null;

            items.Add(new TagImportItemDto(
                Path: path,
                Name: string.IsNullOrWhiteSpace(name) ? null : name,
                Color: string.IsNullOrWhiteSpace(color) ? null : color,
                Description: string.IsNullOrWhiteSpace(desc) ? null : desc
            ));
        }

        return (items, errors);
    }

    private static List<string> ParseCsvLine(string line)
    {
        var result = new List<string>();
        var current = new System.Text.StringBuilder();
        var inQuotes = false;

        for (var i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (c == '"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
                {
                    current.Append('"');
                    i++;
                }
                else
                {
                    inQuotes = !inQuotes;
                }
            }
            else if (c == ',' && !inQuotes)
            {
                result.Add(current.ToString());
                current.Clear();
            }
            else
            {
                current.Append(c);
            }
        }
        result.Add(current.ToString());
        return result;
    }

    private static string NormalizePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return string.Empty;
        var n = path.Trim().Trim('.').Replace('/', '.').Replace('\\', '.');
        while (n.Contains("..")) n = n.Replace("..", ".");
        return n.Trim('.');
    }

    private static string GetLeafName(string path)
    {
        var idx = path.LastIndexOf('.');
        return idx >= 0 ? path[(idx + 1)..] : path;
    }

    private static string? NormalizeColor(string? color)
    {
        if (string.IsNullOrWhiteSpace(color)) return null;
        var c = color.Trim();
        if (!c.StartsWith('#')) c = $"#{c}";
        return HexColorRegex().IsMatch(c) ? c : null;
    }
}
