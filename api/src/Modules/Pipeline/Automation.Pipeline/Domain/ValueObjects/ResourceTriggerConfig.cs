namespace Automation.Pipeline.Domain.ValueObjects;

public class ResourceTriggerConfig
{
    public Guid? RepositoryId { get; set; }
    public List<string> Extensions { get; set; } = [];
}
