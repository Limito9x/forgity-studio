using System.Text.Json;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.ValueObjects;

namespace Automation.Pipeline.Domain.Entities;

public class PipelineNode : AuditableEntity
{
    public Guid PipelineId { get; set; }
    public Pipeline Pipeline { get; set; } = null!;

    public Guid? ParentId { get; set; }
    public PipelineNode? Parent { get; set; }
    public ICollection<PipelineNode> Children { get; set; } = new List<PipelineNode>();

    // Trong thiết kế chỉ để refId
    // Vì node có thể là tool hoặc node def (user custom) -> generic
    public string RefId { get; set; } = string.Empty;
    public PipelineNodeKind Kind { get; set; } = PipelineNodeKind.Custom;
    public NodePosition Position { get; set; } = new(0, 0);
    public NodeSize? Size { get; set; }
    public JsonDocument? Config { get; set; }
    public JsonDocument? Metadata { get; set; }

    public PipelineNode() { }

    public PipelineNode(
        Guid id,
        Guid pipelineId,
        string refId,
        PipelineNodeKind kind,
        float positionX,
        float positionY,
        JsonDocument? config = null,
        Guid? parentId = null,
        NodeSize? size = null,
        JsonDocument? metadata = null
    )
    {
        Id = id != Guid.Empty ? id : IdGenerator.NewId();
        PipelineId = pipelineId;
        RefId = refId;
        Kind = kind;
        Position = new NodePosition(positionX, positionY);
        Config = config;
        ParentId = parentId;
        Size = size;
        Metadata = metadata;
    }

    public PipelineNode(
        Guid id,
        Guid pipelineId,
        string refId,
        string kind,
        float positionX,
        float positionY,
        JsonDocument? config = null,
        Guid? parentId = null,
        NodeSize? size = null,
        JsonDocument? metadata = null
    ) : this(
        id,
        pipelineId,
        refId,
        Enum.TryParse<PipelineNodeKind>(kind, true, out var k) ? k : PipelineNodeKind.Custom,
        positionX,
        positionY,
        config,
        parentId,
        size,
        metadata
    ) { }

    public void Update(float x, float y, Guid? parentId = null, NodeSize? size = null)
    {
        Position = new NodePosition(x, y);
        ParentId = parentId;
        if (size != null)
        {
            Size = size;
        }
    }

    public void AssignToParent(Guid? parentId)
    {
        ParentId = parentId;
    }

    public void UpdateConfig(JsonDocument? config)
    {
        Config = config;
    }

    public void UpdateMetadata(JsonDocument? metadata)
    {
        Metadata = metadata;
    }
}

public record NodePosition(float X, float Y);
public record NodeSize(float Width, float Height);

