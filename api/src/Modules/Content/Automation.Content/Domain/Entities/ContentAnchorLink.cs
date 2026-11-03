using Automation.Content.Domain.Enums;
using Automation.SharedKernel.Domain.Entities;

namespace Automation.Content.Domain.Entities;

public class ContentAnchorLink : BaseEntity
{
    public Guid ProjectId { get; set; }
    
    public Guid ContentItemId { get; set; }
    public ContentItem ContentItem { get; set; } = null!;
    
    /// <summary>
    /// Virtual path within the content tree, e.g. "root/Eva.blend", "Outfit1/BrzUsBra".
    /// </summary>
    public string AnchorPath { get; set; } = string.Empty;
    
    public ContentLinkTargetType TargetType { get; set; } = ContentLinkTargetType.Resource;
    public Guid TargetId { get; set; }
    
    public string? MetadataJson { get; set; }

    public ContentAnchorLink() { }

    public ContentAnchorLink(
        Guid projectId,
        Guid contentItemId,
        string anchorPath,
        ContentLinkTargetType targetType,
        Guid targetId,
        string? metadataJson = null
    )
    {
        ProjectId = projectId;
        ContentItemId = contentItemId;
        AnchorPath = anchorPath;
        TargetType = targetType;
        TargetId = targetId;
        MetadataJson = metadataJson;
    }
}

