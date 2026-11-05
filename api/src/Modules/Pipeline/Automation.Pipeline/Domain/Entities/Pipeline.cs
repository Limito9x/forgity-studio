using System.ComponentModel.DataAnnotations.Schema;
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

    public Guid? ActiveSnapshotId { get; set; }
    public PipelineSnapshot? ActiveSnapshot { get; set; }
    public string? GraphHash { get; set; }

    // Unified Graph Storage (JSONB single column)
    public PipelineGraphDocument GraphData { get; set; } = new();

    // Facade Properties: 100% backward-compatible with existing engine code
    [NotMapped]
    public List<PipelineParameter> Parameters
    {
        get => GraphData.Parameters;
        set => GraphData.Parameters = value ?? [];
    }

    [NotMapped]
    public IReadOnlyList<PipelineNode> Nodes => GraphData.Nodes;

    [NotMapped]
    public IReadOnlyList<PipelineEdge> Edges => GraphData.Edges;

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
        GraphData.Nodes.Add(new PipelineNode(IdGenerator.NewId(), Id, refId, kind, x, y, config, parentId));
    }

    public void AddNode(PipelineNode node)
    {
        GraphData.Nodes.Add(node);
    }

    public void RemoveNode(Guid nodeId)
    {
        var node = GraphData.Nodes.FirstOrDefault(x => x.Id == nodeId);
        if (node != null)
        {
            GraphData.Nodes.Remove(node);
        }
    }

    public void UpdateNode(Guid nodeId, float x, float y, Guid? parentId = null, NodeSize? size = null)
    {
        var node = GraphData.Nodes.FirstOrDefault(x => x.Id == nodeId);
        node?.Update(x, y, parentId, size);
    }

    public void UpdateNodeConfig(Guid nodeId, JsonDocument? config)
    {
        var node = GraphData.Nodes.FirstOrDefault(x => x.Id == nodeId);
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
        GraphData.Edges.Add(edge);
        return edge;
    }

    public void AddEdge(PipelineEdge edge)
    {
        GraphData.Edges.Add(edge);
    }

    public void RemoveEdge(Guid edgeId)
    {
        var edge = GraphData.Edges.FirstOrDefault(x => x.Id == edgeId);
        if (edge != null)
        {
            GraphData.Edges.Remove(edge);
        }
    }

    public void ClearEdges()
    {
        GraphData.Edges.Clear();
    }
}
