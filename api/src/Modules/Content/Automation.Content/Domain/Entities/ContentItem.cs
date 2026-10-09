using System.Text.Json;
using Automation.SharedKernel.Domain.Interfaces;

namespace Automation.Content.Domain.Entities;

public class ContentItem : BaseEntity, IAuditTrackable
{
    public Guid ContentTypeId { get; set; }
    public ContentType ContentType { get; set; } = null!;
    public Guid ProjectId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty;

    public ContentItem() { }

    public ContentItem(Guid contentTypeId, Guid projectId, string name, string key)
    {
        ContentTypeId = contentTypeId;
        ProjectId = projectId;
        Name = name;
        Key = key;
    }

    public void Update(string name, string key)
    {
        Name = name;
        Key = key;
    }
}

