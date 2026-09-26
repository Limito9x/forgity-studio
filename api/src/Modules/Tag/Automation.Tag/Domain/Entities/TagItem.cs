namespace Automation.Tag.Domain.Entities;

public class TagItem : AuditableEntity
{
    public Guid ProjectId { get; set; }
    
    /// <summary>
    /// Hierarchical dot-separated path (PostgreSQL ltree), e.g. 'Asset.Character.Hero'
    /// </summary>
    public LTree Path { get; set; } = string.Empty;
    
    /// <summary>
    /// Leaf name/label of this node, e.g. 'Hero'
    /// </summary>
    public string Name { get; set; } = string.Empty;
    
    public string? Color { get; set; }
    public string? Description { get; set; }
    
    public Guid? ParentId { get; set; }
    public TagItem? Parent { get; set; }
    public List<TagItem> Children { get; set; } = [];
    public List<TagLink> Links { get; set; } = [];

    public TagItem() { }

    public TagItem(Guid projectId, string path, string name, string? color = null, string? description = null, Guid? parentId = null)
    {
        ProjectId = projectId;
        Path = path;
        Name = name;
        Color = color;
        Description = description;
        ParentId = parentId;
    }
}