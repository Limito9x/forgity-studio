using Automation.Pipeline.Domain.Enums;

namespace Automation.Pipeline.Domain.Entities;

public class PipelineEdge : AuditableEntity
{
    public Guid PipelineId { get; set; }
    public Pipeline Pipeline { get; set; } = null!;
    public Guid SourcePipelineNodeId { get; set; }
    public PipelineNode SourcePipelineNode { get; set; } = null!;
    public string SourcePin { get; set; } = string.Empty;
    public Guid TargetPipelineNodeId { get; set; }
    public PipelineNode TargetPipelineNode { get; set; } = null!;
    public string TargetPin { get; set; } = string.Empty;
    public EdgeKind Kind { get; set; }

    public PipelineEdge()
    {
        Id = IdGenerator.NewId();
    }

    public PipelineEdge(
        Guid pipelineId,
        Guid sourcePipelineNodeId,
        string sourcePin,
        Guid targetPipelineNodeId,
        string targetPin,
        EdgeKind? kind = null,
        Guid? id = null
    )
    {
        Id = id.HasValue && id.Value != Guid.Empty ? id.Value : IdGenerator.NewId();
        PipelineId = pipelineId;
        SourcePipelineNodeId = sourcePipelineNodeId;
        SourcePin = sourcePin;
        TargetPipelineNodeId = targetPipelineNodeId;
        TargetPin = targetPin;
        Kind = kind ?? (IsExecPin(sourcePin) || IsExecPin(targetPin)
            ? EdgeKind.Exec
            : EdgeKind.Data);
    }

    private static bool IsExecPin(string? pin)
    {
        if (string.IsNullOrWhiteSpace(pin)) return false;
        var norm = pin.Replace(" ", "").Replace("_", "").Replace("-", "").ToLowerInvariant();
        return norm is "execin" or "execout" or "exec" or "loopbody" or "completed";
    }
}
