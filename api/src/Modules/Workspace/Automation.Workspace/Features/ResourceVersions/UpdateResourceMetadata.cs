using System.Text.Json;
using Automation.Tag.Contracts;
using Automation.Workspace.Contracts.Extensions;
using Automation.Workspace.Infrastructure.Persistence;
using FluentResults;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Workspace.Features.ResourceVersions;

// 1. Command & Validator
public record UpdateResourceMetadataCommand(
    Guid ResourceVersionId,
    JsonElement Data
);

public class UpdateResourceMetadataValidator : AbstractValidator<UpdateResourceMetadataCommand>
{
    public UpdateResourceMetadataValidator()
    {
        RuleFor(x => x.ResourceVersionId)
            .NotEmpty()
            .WithMessage("ResourceVersionId is required.");
    }
}

// 2. Handler
[Transactional(typeof(WorkspaceDbContext))]
public class UpdateResourceMetadataHandler(WorkspaceDbContext db, ITagApi tagApi)
{
    public async Task<Result<bool>> HandleAsync(
        UpdateResourceMetadataCommand command,
        CancellationToken ct
    )
    {
        var version = await db.ResourceVersions
            .FirstOrDefaultAsync(x => x.Id == command.ResourceVersionId, ct);

        if (version is null)
            return Result.Fail($"ResourceVersion with ID '{command.ResourceVersionId}' was not found.");

        var newMetadataDoc = JsonDocument.Parse(command.Data.GetRawText());

        // 1. Tag Path Re-alignment algorithm (if there was old metadata)
        if (version.Metadata != null)
        {
            var tagLinksResult = await tagApi.GetTagsByEntityAsync("ResourceVersion", version.Id, ct);
            if (tagLinksResult.IsSuccess && tagLinksResult.Value.Count > 0)
            {
                var updatedLinks = TagMigrationHelper.RealignTagPaths(
                    version.Metadata.RootElement,
                    newMetadataDoc.RootElement,
                    tagLinksResult.Value
                );

                if (updatedLinks.Count > 0)
                {
                    // Build dictionary for TagLinkId -> new MetadataJson with new path
                    var tagLinkIdToMetadata = new Dictionary<Guid, string>();
                    foreach (var tagDetail in tagLinksResult.Value)
                    {
                        var match = updatedLinks.FirstOrDefault(u => u.TagId == tagDetail.TagId);
                        if (match != null)
                        {
                            var newMetadataObj = new { path = match.JsonPath };
                            tagLinkIdToMetadata[tagDetail.TagLinkId] = JsonSerializer.Serialize(newMetadataObj);
                        }
                    }

                    if (tagLinkIdToMetadata.Count > 0)
                    {
                        await tagApi.UpdateTagLinksMetadataAsync(tagLinkIdToMetadata, ct);
                    }
                }
            }
        }

        // 2. Update ResourceVersion Metadata
        version.UpdateMetadata(newMetadataDoc);
        await db.SaveChangesAsync(ct);

        return Result.Ok(true);
    }
}
