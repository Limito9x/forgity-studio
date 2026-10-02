using System.Text.Json;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.Models;

namespace Automation.Pipeline.Features.Pipelines.Dtos;

public record ValidatePipelineQuery(
    Guid PipelineId,
    Dictionary<string, object?>? RuntimeInputs = null
);

public record ValidatePipelineResponse(
    bool IsValid,
    IReadOnlyList<string> CycleNodeIds,
    IReadOnlyList<UnresolvedPin> UnresolvedPins
);

public record RunPipelineRequest(
    Dictionary<string, object?>? RuntimeInputs = null
);

public record RunPipelineCommand(
    Guid PipelineId,
    Dictionary<string, object?>? RuntimeInputs = null
);

public record PipelineExecutionDto(
    Guid Id,
    Guid PipelineId,
    Guid AgentId,
    ExecutionStatus Status,
    DateTimeOffset? StartedAt,
    DateTimeOffset? FinishedAt,
    string? ErrorMessage,
    int NextNodeIndex,
    string? CurrentBatchId,
    JsonDocument? ExecutionState
);

public record NodeExecutionDto(
    Guid Id,
    Guid PipelineExecutionId,
    Guid PipelineNodeId,
    ExecutionStatus Status,
    DateTimeOffset? StartedAt,
    DateTimeOffset? FinishedAt,
    string? ErrorMessage,
    JsonDocument? Output,
    JsonDocument? Log
);

public record PipelineSummaryDto(
    Guid Id,
    Guid ProjectId,
    string Name,
    PipelineTriggerType TriggerType,
    Guid? TriggerWorkspaceId,
    int NodeCount,
    int EdgeCount,
    DateTimeOffset CreatedAt,
    JsonDocument? TriggerConfig = null
);

public record PipelineParameterDto(
    Guid Id,
    string Key,
    string Label,
    PipelineParameterKind Kind,
    PinPrimitiveType Type,
    PinCardinality Cardinality,
    string? StructType,
    bool IsRequired,
    string? DefaultValue,
    string? Description,
    int Order,
    Dictionary<string, object?>? ContextData
);

public record PipelineNodeGraphDto(
    Guid Id,
    string RefId,
    PipelineNodeKind Kind,
    string Label,
    string? Category,
    string? Executor,
    NodePosition Position,
    IReadOnlyList<PinDefinition> Inputs,
    IReadOnlyList<PinDefinition> Outputs,
    Dictionary<string, object?>? ConfigValues,
    Guid? ParentId = null,
    NodeSize? Size = null,
    Dictionary<string, object?>? Metadata = null
);

public record PipelineEdgeGraphDto(
    Guid Id,
    Guid SourceNodeId,
    string SourcePin,
    Guid TargetNodeId,
    string TargetPin,
    EdgeKind Kind = EdgeKind.Data
);

public record UpdatePipelineTriggerRequest(
    PipelineTriggerType TriggerType,
    Guid? TriggerWorkspaceId,
    JsonDocument? TriggerConfig = null
);

public record UpdatePipelineTriggerCommand(
    Guid PipelineId,
    PipelineTriggerType TriggerType,
    Guid? TriggerWorkspaceId,
    JsonDocument? TriggerConfig = null
);

public record PipelineGraphDto(
    Guid Id,
    Guid ProjectId,
    string Name,
    PipelineTriggerType TriggerType,
    Guid? TriggerWorkspaceId,
    IReadOnlyList<PipelineNodeGraphDto> Nodes,
    IReadOnlyList<PipelineEdgeGraphDto> Edges,
    IReadOnlyList<PipelineParameterDto> Parameters,
    JsonDocument? TriggerConfig = null
);

public record SavePipelineNodeItem(
    Guid? Id,
    string RefId,
    PipelineNodeKind Kind,
    float PositionX,
    float PositionY,
    Dictionary<string, object?>? ConfigValues,
    Guid? ParentId = null,
    float? Width = null,
    float? Height = null,
    Dictionary<string, object?>? Metadata = null
);

public record SavePipelineEdgeItem(
    Guid? Id,
    Guid SourceNodeId,
    string SourcePin,
    Guid TargetNodeId,
    string TargetPin
);

public record SavePipelineGraphCommand(
    Guid PipelineId,
    List<SavePipelineNodeItem> Nodes,
    List<SavePipelineEdgeItem> Edges,
    List<PipelineParameter>? Parameters = null
);
