using System.Text.Json;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.Models;

namespace Automation.Pipeline.Features.Pipelines.Dtos;

public record PipelinePackageDto(
    string FormatVersion,
    string BundleType,
    DateTimeOffset ExportedAt,
    PipelinePackageMetadataDto Metadata,
    IReadOnlyList<PipelinePackageItemDto> Pipelines,
    PipelinePackageDependenciesDto Dependencies
);

public record PipelinePackageMetadataDto(
    int TotalPipelines,
    int RootPipelinesCount,
    int SubPipelinesCount
);

public record PipelinePackageItemDto(
    string BundleId,
    string Name,
    string? Description,
    bool IsRoot,
    int ImportOrder,
    IReadOnlyList<string> DependsOn,
    PipelineTriggerType TriggerType,
    IReadOnlyList<PipelineParameterDto> Parameters,
    PipelinePackageGraphDto Graph,
    JsonDocument? TriggerConfig = null
);

public record PipelinePackageGraphDto(
    IReadOnlyList<PipelinePackageNodeDto> Nodes,
    IReadOnlyList<PipelinePackageEdgeDto> Edges
);

public record PipelinePackageNodeDto(
    string TempId,
    string RefId,
    PipelineNodeKind Kind,
    string Label,
    string? Category,
    string? Executor,
    NodePosition Position,
    IReadOnlyList<PinDefinition> Inputs,
    IReadOnlyList<PinDefinition> Outputs,
    Dictionary<string, object?>? ConfigValues,
    string? RefPipelineBundleId = null,
    string? ParentTempId = null,
    NodeSize? Size = null,
    Dictionary<string, object?>? Metadata = null
);

public record PipelinePackageEdgeDto(
    string SourceNodeTempId,
    string SourcePin,
    string TargetNodeTempId,
    string TargetPin,
    EdgeKind Kind = EdgeKind.Data
);

public record PipelinePackageDependenciesDto(
    IReadOnlyList<PipelinePackageScriptDto> CustomScripts,
    IReadOnlyList<PipelinePackageContentTypeDto> RequiredContentTypes
);

public record PipelinePackageScriptDto(
    string Key,
    string Name,
    string Label,
    string Executor,
    string ContentHash,
    string FileName,
    string? ScriptContent,
    IReadOnlyList<PinDefinition> Inputs,
    IReadOnlyList<PinDefinition> Outputs
);

public record PipelinePackageContentTypeDto(
    string Key,
    string Name,
    string? DisplayName,
    string? Icon,
    string? Color,
    string? Description
);

public record ExportPipelineBatchRequest(
    List<Guid> PipelineIds
);

public record ValidatePipelinePackageRequest(
    Guid ProjectId,
    PipelinePackageDto Package
);

public record ValidatePipelinePackageResponseDto(
    bool IsValid,
    IReadOnlyList<string> ValidationErrors,
    PipelinePackageMetadataDto PackageMetadata,
    IReadOnlyList<PipelinePackageItemPreviewDto> Pipelines,
    IReadOnlyList<PipelineScriptDependencyPreviewDto> Scripts,
    IReadOnlyList<PipelineContentTypeDependencyPreviewDto> ContentTypes
);

public record PipelinePackageItemPreviewDto(
    string BundleId,
    string Name,
    bool IsRoot,
    int ImportOrder,
    IReadOnlyList<string> DependsOn,
    int NodeCount,
    int EdgeCount,
    bool HasNameConflict,
    string SuggestedName
);

public record PipelineScriptDependencyPreviewDto(
    string Key,
    string Name,
    string Executor,
    string ContentHash,
    string FileName,
    bool AlreadyExists
);

public record PipelineContentTypeDependencyPreviewDto(
    string Key,
    string Name,
    string? DisplayName,
    bool AlreadyExists
);

public record ImportPipelinePackageRequest(
    Guid ProjectId,
    PipelinePackageDto Package,
    string? NamePrefix = null,
    bool CreateMissingContentTypes = true
);

public record ImportPipelinePackageResponseDto(
    int ImportedPipelinesCount,
    IReadOnlyList<ImportedPipelineSummaryDto> Pipelines,
    int InstalledScriptsCount
);

public record ImportedPipelineSummaryDto(
    string BundleId,
    Guid PipelineId,
    string Name,
    bool IsRoot
);
