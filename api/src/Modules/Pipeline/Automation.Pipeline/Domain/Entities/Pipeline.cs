using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;

namespace Automation.Pipeline.Domain.Entities;

public class Pipeline : BaseEntity
{
    public Guid ProjectId { get; set; }
    public string Name { get; set; } = string.Empty;
    public PipelineTriggerType TriggerType { get; set; } = PipelineTriggerType.Manual;
    public JsonDocument? TriggerConfig { get; set; }

    // Unified Parameter Collection (JSONB)
    public List<PipelineParameter> Parameters { get; set; } = new();

    private readonly List<PipelineNode> _nodes = new();
    public IReadOnlyList<PipelineNode> Nodes => _nodes;
    private readonly List<PipelineEdge> _edges = new();
    public IReadOnlyList<PipelineEdge> Edges => _edges;

    public Pipeline() { }

    public Pipeline(
        Guid projectId,
        string name,
        PipelineTriggerType triggerType = PipelineTriggerType.Manual,
        JsonDocument? triggerConfig = null
    )
    {
        ProjectId = projectId;
        Name = name;
        TriggerType = triggerType;
        TriggerConfig = triggerConfig;
    }

    public void UpdateTrigger(PipelineTriggerType triggerType, JsonDocument? triggerConfig = null)
    {
        TriggerType = triggerType;
        TriggerConfig = triggerConfig;
    }

    public void UpdateName(string name)
    {
        Name = name;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void Archive(string? user = null)
    {
        DeletedAt = DateTimeOffset.UtcNow;
        DeletedBy = user;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void Restore(string? newName = null)
    {
        if (!string.IsNullOrWhiteSpace(newName))
        {
            Name = newName.Trim();
        }
        DeletedAt = null;
        DeletedBy = null;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void AddNode(string refId, string kind, float x, float y, JsonDocument? config = null, Guid? parentId = null)
    {
        _nodes.Add(new PipelineNode(IdGenerator.NewId(), Id, refId, kind, x, y, config, parentId));
    }

    public void AddNode(PipelineNode node)
    {
        _nodes.Add(node);
    }

    public void RemoveNode(Guid nodeId)
    {
        var node = _nodes.FirstOrDefault(x => x.Id == nodeId);
        if (node != null)
        {
            _nodes.Remove(node);
        }
    }

    public void UpdateNode(Guid nodeId, float x, float y, Guid? parentId = null, NodeSize? size = null)
    {
        var node = _nodes.FirstOrDefault(x => x.Id == nodeId);
        node?.Update(x, y, parentId, size);
    }

    public void UpdateNodeConfig(Guid nodeId, JsonDocument? config)
    {
        var node = _nodes.FirstOrDefault(x => x.Id == nodeId);
        node?.UpdateConfig(config);
    }

    public PipelineEdge AddEdge(
        Guid sourcePipelineNodeId,
        string sourcePin,
        Guid targetPipelineNodeId,
        string targetPin,
        Guid? id = null,
        EdgeKind? kind = null
    )
    {
        var edge = new PipelineEdge(Id, sourcePipelineNodeId, sourcePin, targetPipelineNodeId, targetPin, kind, id);
        _edges.Add(edge);
        return edge;
    }

    public void AddEdge(PipelineEdge edge)
    {
        _edges.Add(edge);
    }

    public void RemoveEdge(Guid edgeId)
    {
        var edge = _edges.FirstOrDefault(x => x.Id == edgeId);
        if (edge != null)
        {
            _edges.Remove(edge);
        }
    }

    public void ClearEdges()
    {
        _edges.Clear();
    }
}
