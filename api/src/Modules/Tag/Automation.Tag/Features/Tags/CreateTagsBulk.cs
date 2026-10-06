using System.Text.RegularExpressions;
using Automation.Tag.Infrastructure.Persistence;
using Automation.Tag.Shared.Dtos;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Tag.Features.Tags;

public record TagBulkRow(string Name, string? Color);

public record CreateTagsBulkCommand(
    Guid ProjectId,
    string? ParentPath,
    List<TagBulkRow> Rows
);

public record BulkRowError(int Index, string Name, string Reason);

public record CreateTagsBulkResult(
    List<TagItemDto> Created,
    List<BulkRowError> Failed
);

public partial class CreateTagsBulkValidator : Validator<CreateTagsBulkCommand>
{
    [GeneratedRegex(@"^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$")]
    private static partial Regex LtreePathRegex();

    [GeneratedRegex(@"^[A-Za-z0-9_]+$")]
    private static partial Regex LeafNameRegex();

    [GeneratedRegex(@"^#[0-9a-fA-F]{6}$")]
    private static partial Regex HexColorRegex();

    public CreateTagsBulkValidator()
    {
        RuleFor(x => x.ProjectId).NotEmpty();

        RuleFor(x => x.ParentPath)
            .Must(p => string.IsNullOrWhiteSpace(p) || LtreePathRegex().IsMatch(Normalize(p!)))
            .WithMessage("ParentPath must use dot notation with letters, numbers, underscores (e.g. Materials.Skin).")
            .When(x => !string.IsNullOrWhiteSpace(x.ParentPath));

        RuleFor(x => x.Rows)
            .NotNull()
            .Must(r => r.Count >= 1 && r.Count <= 50)
            .WithMessage("Rows must contain 1 to 50 entries.");

        RuleForEach(x => x.Rows).ChildRules(row =>
        {
            row.RuleFor(r => r.Name)
                .NotEmpty().WithMessage("Name is required.")
                .MaximumLength(300)
                .Matches(@"^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$")
                .WithMessage("Name must be dot notation, each segment letters/numbers/underscores (e.g. Textures.Skin_Normal or Skin_Normal).");

            row.RuleFor(r => r.Color)
                .Must(c => string.IsNullOrWhiteSpace(c) || HexColorRegex().IsMatch(c!.Trim()))
                .WithMessage("Color must be hex like #3b82f6 or empty.")
                .When(r => !string.IsNullOrWhiteSpace(r.Color));
        });
    }

    private static string Normalize(string path) => path.Trim().Trim('.').Replace('/', '.').Replace('\\', '.');
}

public class CreateTagsBulkEndpoint(IMessageBus bus) : Endpoint<CreateTagsBulkCommand, CreateTagsBulkResult>
{
    public override void Configure()
    {
        Post("bulk");
        Group<TagsGroup>();
        Permissions(P.Tag.Create);
    }

    public override async Task HandleAsync(CreateTagsBulkCommand command, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<CreateTagsBulkResult>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(TagDbContext))]
public class CreateTagsBulkHandler(TagDbContext db)
{
    public async Task<Result<CreateTagsBulkResult>> HandleAsync(CreateTagsBulkCommand command, CancellationToken ct)
    {
        var parentPath = NormalizeNullable(command.ParentPath);
        var failed = new List<BulkRowError>();
        var created = new List<TagItemDto>();

        // Deduplicate within request (case-insensitive)
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var validRows = new List<(int OriginalIndex, TagBulkRow Row, string FullPath)>();

        for (var i = 0; i < command.Rows.Count; i++)
        {
            var row = command.Rows[i];
            var normalizedName = NormalizeRowName(row.Name);
            if (string.IsNullOrWhiteSpace(normalizedName))
            {
                failed.Add(new BulkRowError(i, row.Name ?? "", "Name is required."));
                continue;
            }

            var fullPath = string.IsNullOrWhiteSpace(parentPath) ? normalizedName : $"{parentPath}.{normalizedName}";

            if (!seen.Add(fullPath))
            {
                failed.Add(new BulkRowError(i, normalizedName, $"Duplicate path in request: {fullPath}"));
                continue;
            }

            validRows.Add((i, new TagBulkRow(normalizedName, NormalizeColor(row.Color)), fullPath));
        }

        if (validRows.Count == 0)
            return Result.Ok(new CreateTagsBulkResult(created, failed));

        // Ensure parent chain exists if parentPath provided
        Guid? parentId = null;
        if (!string.IsNullOrWhiteSpace(parentPath))
        {
            var ensureParent = await EnsureParentChainAsync(command.ProjectId, parentPath, ct);
            if (ensureParent.IsFailed)
            {
                // Mark all valid rows as failed due to parent error
                foreach (var v in validRows)
                    failed.Add(new BulkRowError(v.OriginalIndex, v.Row.Name, ensureParent.Errors.FirstOrDefault()?.Message ?? "Failed to ensure parent path."));
                return Result.Ok(new CreateTagsBulkResult(created, failed.OrderBy(f => f.Index).ToList()));
            }
            parentId = ensureParent.Value;
        }

        // Check existing paths in DB
        var fullPaths = validRows.Select(v => v.FullPath).ToList();
        var existingPaths = await db.TagItems.AsNoTracking()
            .Where(t => t.ProjectId == command.ProjectId && fullPaths.Contains(t.Path))
            .Select(t => t.Path.ToString())
            .ToListAsync(ct);

        var existingSet = new HashSet<string>(existingPaths, StringComparer.OrdinalIgnoreCase);

        var toInsert = new List<(int OriginalIndex, TagBulkRow Row, string FullPath)>();
        foreach (var v in validRows)
        {
            if (existingSet.Contains(v.FullPath))
            {
                failed.Add(new BulkRowError(v.OriginalIndex, v.Row.Name, $"Tag already exists: {v.FullPath}"));
            }
            else
            {
                toInsert.Add(v);
            }
        }

        foreach (var item in toInsert)
        {
            var result = await EnsureTagPathAsync(command.ProjectId, item.FullPath, item.Row.Color, ct);
            if (result.IsFailed)
            {
                failed.Add(new BulkRowError(item.OriginalIndex, item.Row.Name, result.Errors.FirstOrDefault()?.Message ?? "Failed to create tag path."));
                continue;
            }
            var dto = result.Value;
            created.Add(new TagItemDto(dto.Id, dto.ProjectId, dto.Path, dto.Name, dto.Color, dto.Description, null, dto.CreatedAt));
        }

        if (toInsert.Count > 0)
            await db.SaveChangesAsync(ct);

        // Sort failed by original index for stable UI
        failed = failed.OrderBy(f => f.Index).ToList();

        return Result.Ok(new CreateTagsBulkResult(created, failed));
    }

    private async Task<Result<Guid?>> EnsureParentChainAsync(Guid projectId, string parentPath, CancellationToken ct)
    {
        var segments = parentPath.Split('.');
        Domain.Entities.TagItem? parentNode = null;
        var currentPrefix = "";
        for (var i = 0; i < segments.Length; i++)
        {
            var segment = segments[i];
            currentPrefix = i == 0 ? segment : $"{currentPrefix}.{segment}";
            var existing = await db.TagItems.FirstOrDefaultAsync(t => t.ProjectId == projectId && t.Path == currentPrefix, ct);
            if (existing == null)
            {
                existing = new Domain.Entities.TagItem(projectId, currentPrefix, segment, null, null, parentNode?.Id);
                db.TagItems.Add(existing);
                await db.SaveChangesAsync(ct);
            }
            parentNode = existing;
        }
        return Result.Ok<Guid?>(parentNode?.Id);
    }

    private async Task<Result<Contracts.Dtos.TagDto>> EnsureTagPathAsync(Guid projectId, string fullPath, string? color, CancellationToken ct)
    {
        var segments = fullPath.Split('.');
        Domain.Entities.TagItem? parentNode = null;
        var currentPrefix = "";
        for (var i = 0; i < segments.Length; i++)
        {
            var segment = segments[i];
            currentPrefix = i == 0 ? segment : $"{currentPrefix}.{segment}";
            var isLeaf = i == segments.Length - 1;
            var existing = await db.TagItems.FirstOrDefaultAsync(t => t.ProjectId == projectId && t.Path == currentPrefix, ct);
            if (existing == null)
            {
                existing = new Domain.Entities.TagItem(projectId, currentPrefix, segment, isLeaf ? color : null, null, parentNode?.Id);
                db.TagItems.Add(existing);
                await db.SaveChangesAsync(ct);
            }
            else if (isLeaf && !string.IsNullOrWhiteSpace(color))
            {
                existing.Color = color;
                await db.SaveChangesAsync(ct);
            }
            parentNode = existing;
        }
        return Result.Ok(new Contracts.Dtos.TagDto(parentNode!.Id, parentNode.ProjectId, parentNode.Path, parentNode.Name, parentNode.Color, parentNode.Description, parentNode.CreatedAt));
    }

    private static string? NormalizeNullable(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return null;
        var n = path.Trim().Trim('.').Replace('/', '.').Replace('\\', '.');
        return string.IsNullOrWhiteSpace(n) ? null : n;
    }

    private static string NormalizeRowName(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
        var n = raw.Trim().Trim('.').Replace('/', '.').Replace('\\', '.');
        // collapse .. and trim again
        while (n.Contains("..")) n = n.Replace("..", ".");
        return n.Trim('.');
    }

    private static string? NormalizeColor(string? color)
    {
        if (string.IsNullOrWhiteSpace(color)) return null;
        var c = color.Trim();
        return c;
    }
}
